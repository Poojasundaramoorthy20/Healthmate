from dotenv import load_dotenv
load_dotenv()

import os
import google.generativeai as genai
import requests
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger
from datetime import datetime, timedelta
import smtplib
from email.mime.text import MIMEText
from twilio.rest import Client as TwilioClient
from flask_cors import CORS
from google.cloud import speech_v1p1beta1 as speech
from google.cloud import texttospeech_v1 as texttospeech
from google.oauth2 import service_account
from pymongo import MongoClient
from bson.objectid import ObjectId
import certifi # Import certifi for SSL/TLS connections

# ==========================================
# FLASK INITIALIZATION
# ==========================================
app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# ==========================================
# GEMINI API CONFIGURATION
# ==========================================
try:
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
    GOOGLE_CLOUD_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT_ID")

    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.5-flash')
        print("✓ Gemini API configured successfully")
    else:
        print("⚠ GEMINI_API_KEY not found in environment variables")
        model = None
except Exception as e:
    print(f"✗ Error configuring Gemini API: {e}")
    model = None

# ==========================================
# GLOBAL VARIABLES
# ==========================================
chat_sessions = {}
GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY")

# ==========================================
# MONGODB CONFIGURATION
# ==========================================
MONGO_URI = os.environ.get("MONGO_URI")
mongo_client = None
db = None

if MONGO_URI:
    try:
        # For cloud-hosted MongoDB with SSL/TLS
        mongo_client = MongoClient(MONGO_URI, tlsAllowInvalidCertificates=False, tlsCAFile=certifi.where())
        db = mongo_client.health_assistant_db # Or your preferred database name
        db.reminders.create_index("reminder_time")
        print("✓ MongoDB connected successfully")
    except Exception as e:
        print(f"✗ Error connecting to MongoDB: {e}")
        mongo_client = None
        db = None
else:
    print("⚠ MONGO_URI not found in environment variables. MongoDB will not be available.")

# ==========================================
# BACKGROUND SCHEDULER
# ==========================================
scheduler = BackgroundScheduler()

# ==========================================
# TWILIO CONFIGURATION
# ==========================================
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_FROM_NUMBER = os.environ.get("TWILIO_FROM_NUMBER")

# ==========================================
# SMTP CONFIGURATION
# ==========================================
SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL") or SMTP_USER

# ==========================================
# GOOGLE CLOUD SPEECH/TTS
# ==========================================
speech_client = None
tts_client = None
GOOGLE_APPLICATION_CREDENTIALS = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")

if GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_CLOUD_PROJECT_ID:
    try:
        credentials = service_account.Credentials.from_service_account_file(GOOGLE_APPLICATION_CREDENTIALS)
        speech_client = speech.SpeechClient(credentials=credentials)
        tts_client = texttospeech.TextToSpeechClient(credentials=credentials)
        print("✓ Google Cloud Speech & Text-to-Speech clients initialized.")
    except Exception as e:
        print(f"✗ Error initializing Google Cloud clients: {e}")
else:
    print("⚠ GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_PROJECT_ID not set")

# ==========================================
# HELPER FUNCTIONS
# ==========================================
def _parse_reminder_time(reminder_time: str) -> datetime:
    """Parses reminder_time from frontend input."""
    reminder_time = (reminder_time or '').strip()
    if not reminder_time:
        raise ValueError("Empty reminder_time")

    try:
        if 'T' in reminder_time:
            iso = reminder_time.replace('Z', '+00:00')
            dt = datetime.fromisoformat(iso)
            return dt
        now = datetime.now()
        hour, minute = [int(x) for x in reminder_time.split(':', 1)]
        dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if dt <= now:
            dt = dt + timedelta(days=1)
        return dt
    except Exception as exc:
        raise ValueError(f"Invalid reminder_time format: {reminder_time}") from exc


def _send_sms_if_configured(to_number: str, message: str) -> bool:
    if not to_number:
        return False
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER):
        print("Twilio not configured; skipping SMS")
        return False
    try:
        client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        client.messages.create(to=to_number, from_=TWILIO_FROM_NUMBER, body=message)
        print(f"✓ SMS sent to {to_number}")
        return True
    except Exception as e:
        print(f"✗ SMS send error: {e}")
        return False


def _send_email_if_configured(to_email: str, subject: str, body: str) -> bool:
    if not to_email:
        return False
    if not (SMTP_HOST and SMTP_PORT and SMTP_USER and SMTP_PASSWORD and SMTP_FROM_EMAIL):
        print("SMTP not configured; skipping email")
        return False
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = SMTP_FROM_EMAIL
        msg['To'] = to_email

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        print(f"✓ Email sent to {to_email}")
        return True
    except Exception as e:
        print(f"✗ Email send error: {e}")
        return False


def schedule_reminder_job(reminder: dict) -> str:
    """Schedules reminder notification."""
    due_dt = _parse_reminder_time(str(reminder['reminder_time']))

    def _job_action(rem=reminder):
        text = f"⏰ Medicine Reminder: Take {rem.get('medicine_name')}"
        _send_sms_if_configured(rem.get('phone'), text)
        _send_email_if_configured(rem.get('email'), "Medicine Reminder", text)
        with app.app_context():
            socketio.emit('reminder_due', {'reminder': rem})
        print(f"Reminder triggered for {rem.get('medicine_name')} at {datetime.now()}")

    trigger = DateTrigger(run_date=due_dt)
    job = scheduler.add_job(_job_action, trigger=trigger, id=f"reminder-{reminder['_id']}")
    print(f"✓ Scheduled reminder for {due_dt}")
    return job.id

# ==========================================
# ROUTES - FRONTEND PAGES
# ==========================================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chatbot')
def chatbot():
    return render_template('chatbot.html')

@app.route('/reminders')
def reminders_page():
    return render_template('reminders.html')

@app.route('/hospitals')
def hospitals_page():
    return render_template('hospitals.html', GOOGLE_MAPS_API_KEY=os.environ.get("GOOGLE_MAPS_API_KEY"))

# ==========================================
# ROUTES - CHATBOT
# ==========================================
@app.route('/chat', methods=['POST'])
def chat_api():
    try:
        data = request.get_json()
        user_message = data.get('message', '').strip()
        session_id = data.get('session_id', 'default')

        if not user_message:
            return jsonify({'error': 'No message provided', 'success': False}), 400

        if model is None:
            return jsonify({'error': 'Gemini API not configured', 'success': False}), 500

        chat = chat_sessions.setdefault(session_id, model.start_chat(history=[]))
        response = chat.send_message(user_message)
        return jsonify({'response': response.text, 'success': True})
    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({'error': str(e), 'success': False}), 500

# ==========================================
# ROUTES - REMINDERS
# ==========================================
@app.route('/api/reminders', methods=['GET'])
def get_reminders():
    try:
        if not db:
            return jsonify({'error': 'MongoDB not connected', 'success': False}), 500

        reminders_list = list(db.reminders.find({}, {"_id": 1, "medicine_name": 1, "reminder_time": 1, "phone": 1, "email": 1}))
        for r in reminders_list:
            r['_id'] = str(r['_id'])
            r['reminder_time'] = str(r['reminder_time'])
        return jsonify({'reminders': reminders_list, 'success': True})
    except Exception as e:
        print(f"Error fetching reminders: {e}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/reminders', methods=['POST'])
def add_reminder():
    try:
        data = request.get_json()
        medicine_name = data.get('medicine_name', '').strip()
        reminder_time = data.get('reminder_time', '').strip()
        phone = (data.get('phone') or '').strip()
        email = (data.get('email') or '').strip()

        if not medicine_name or not reminder_time:
            return jsonify({'error': 'Medicine name and time required', 'success': False}), 400

        if not db:
            print("MongoDB not connected, cannot add reminder.")
            return jsonify({'error': 'MongoDB not connected', 'success': False}), 500

        reminder = {
            'medicine_name': medicine_name,
            'reminder_time': _parse_reminder_time(reminder_time),
            'phone': phone or None,
            'email': email or None,
            'created_at': datetime.now()
        }

        result = db.reminders.insert_one(reminder)
        reminder['_id'] = str(result.inserted_id)
        schedule_reminder_job(reminder)

        return jsonify({'reminder': reminder, 'success': True}), 201
    except Exception as e:
        print(f"Error adding reminder: {e}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/reminders/<reminder_id>', methods=['DELETE'])
def delete_reminder(reminder_id):
    try:
        if not db:
            print("MongoDB not connected, cannot delete reminder.")
            return jsonify({'error': 'MongoDB not connected', 'success': False}), 500

        result = db.reminders.delete_one({'_id': ObjectId(reminder_id)})
        if result.deleted_count == 0:
            return jsonify({'error': 'Reminder not found', 'success': False}), 404
        return jsonify({'message': 'Reminder deleted', 'success': True})
    except Exception as e:
        print(f"Error deleting reminder: {e}")
        return jsonify({'error': str(e), 'success': False}), 500
    
# ==========================================
# VOICE ASSISTANT ROUTES
# ==========================================
from flask import send_file
import io

def transcribe_audio_gcs(audio_content):
    """Transcribes voice input to text using Google Speech-to-Text."""
    try:
        audio = speech.RecognitionAudio(content=audio_content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            language_code="en-US"
        )
        response = speech_client.recognize(config=config, audio=audio)
        if not response.results:
            return None
        return response.results[0].alternatives[0].transcript
    except Exception as e:
        print(f"Speech recognition error: {e}")
        return None


def synthesize_speech_gcs(text):
    """Converts AI text reply to speech using Google Text-to-Speech."""
    try:
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name="en-US-Standard-C"
        )
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        response = tts_client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config
        )
        return response.audio_content
    except Exception as e:
        print(f"TTS synthesis error: {e}")
        return None


def get_chat_session(session_id):
    """Gets or creates a Gemini chat session."""
    if session_id not in chat_sessions:
        chat_sessions[session_id] = model.start_chat(history=[])
    return chat_sessions[session_id]


@app.route('/api/voice-chat', methods=['POST'])
def voice_chat():
    """
    Full voice chat:
    - Accepts audio file from frontend
    - Transcribes it to text
    - Sends to Gemini
    - Synthesizes AI response to speech
    """
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided', 'success': False}), 400

        audio_file = request.files['audio']
        audio_content = audio_file.read()

        # Step 1: Transcribe audio
        transcript = transcribe_audio_gcs(audio_content)
        if not transcript:
            return jsonify({'error': 'Speech recognition failed', 'success': False}), 500

        print(f"🎤 User said: {transcript}")

        # Step 2: Send to Gemini
        chat = get_chat_session('voice')
        response = chat.send_message(transcript)
        ai_reply = response.text.strip()

        print(f"🤖 AI replied: {ai_reply}")

        # Step 3: Synthesize speech
        speech_bytes = synthesize_speech_gcs(ai_reply)
        if not speech_bytes:
            return jsonify({'error': 'TTS synthesis failed', 'success': False}), 500

        # Step 4: Return audio + text
        return send_file(
            io.BytesIO(speech_bytes),
            mimetype='audio/mpeg',
            as_attachment=False,
            download_name='ai_reply.mp3'
        )

    except Exception as e:
        print(f"Voice Chat Error: {e}")
        return jsonify({'error': str(e), 'success': False}), 500
@app.route('/voice')
def voice_assistant_page():
    return render_template('voice.html')


# ==========================================
# START FLASK APP
# ==========================================
if __name__ == '__main__':
    print("\n" + "="*50)
    print("🏥 Health Assistant Starting...")
    print("="*50)
    print(f"✓ Flask app initialized")
    print(f"{'✓' if GEMINI_API_KEY else '✗'} Gemini API Key: {'Found' if GEMINI_API_KEY else 'NOT FOUND'}")
    print(f"{'✓' if GOOGLE_PLACES_API_KEY else '✗'} Google Places API Key: {'Found' if GOOGLE_PLACES_API_KEY else 'NOT FOUND'}")
    print(f"{'✓' if os.environ.get('GOOGLE_MAPS_API_KEY') else '✗'} Google Maps API Key: {'Found' if os.environ.get('GOOGLE_MAPS_API_KEY') else 'NOT FOUND'}")
    print(f"✗ Google Cloud Voice Assistant: Removed") # Updated status
    print(f"✓ MongoDB: {'Connected' if db is not None else 'Not Connected'}") # Fixed truth value testing
    print("="*50 + "\n")

    # Start scheduler safely
    if not scheduler.running:
        try:
            scheduler.start()
            print("✓ Background Scheduler started")
        except Exception as e:
            print(f"✗ Failed to start scheduler: {e}")

    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
