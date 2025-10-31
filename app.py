from dotenv import load_dotenv
load_dotenv()

print("App script started!") # Added for debugging

import os
import google.generativeai as genai
import requests # Added for making HTTP requests to external APIs
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-pro')
chat = model.start_chat(history=[])

# In-memory storage for medicine reminders
reminders = []

# Google Places API Key (User needs to set this as an environment variable)
GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat_api():
    user_message = request.json.get('message')
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400

    try:
        response = chat.send_message(user_message)
        return jsonify({'response': response.text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/reminders', methods=['GET'])
def get_reminders():
    return jsonify(reminders)

@app.route('/reminders', methods=['POST'])
def add_reminder():
    data = request.json
    medicine_name = data.get('medicine_name')
    reminder_time = data.get('reminder_time')

    if not medicine_name or not reminder_time:
        return jsonify({'error': 'Medicine name and time are required'}), 400

    new_reminder = {
        'id': len(reminders) + 1, # Simple ID generation
        'medicine_name': medicine_name,
        'reminder_time': reminder_time
    }
    reminders.append(new_reminder)
    return jsonify(new_reminder), 201

@app.route('/reminders/<int:reminder_id>', methods=['DELETE'])
def delete_reminder(reminder_id):
    global reminders
    reminders = [r for r in reminders if r['id'] != reminder_id]
    return jsonify({'message': 'Reminder deleted'}), 200

@app.route('/find_hospitals', methods=['POST'])
def find_hospitals():
    if not GOOGLE_PLACES_API_KEY:
        return jsonify({'error': 'Google Places API Key not set'}), 500

    data = request.json
    latitude = data.get('latitude')
    longitude = data.get('longitude')

    if not latitude or not longitude:
        return jsonify({'error': 'Latitude and Longitude are required'}), 400

    # Google Places API - Nearby Search
    # Type: hospital or clinic
    # RankBy: distance
    # Keyword: hospital or clinic (to filter results if type isn't enough)
    places_api_url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json?location={latitude},{longitude}&radius=5000&type=hospital&keyword=hospital|clinic&key={GOOGLE_PLACES_API_KEY}"

    try:
        response = requests.get(places_api_url)
        response.raise_for_status() # Raise an HTTPError for bad responses (4xx or 5xx)
        places_data = response.json()
        hospitals = []
        for place in places_data.get('results', [])[:5]: # Limit to 5 results
            hospitals.append({
                'name': place.get('name'),
                'address': place.get('vicinity'), # Or use 'formatted_address' if available in detail
                'rating': place.get('rating'),
                'place_id': place.get('place_id')
            })
        return jsonify({'hospitals': hospitals})
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Error connecting to Google Places API: {e}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/list_models')
def list_models():
    if not genai.configure().api_key:
        return jsonify({'error': 'Gemini API Key not configured'}), 500
    
    try:
        models_list = []
        for m in genai.list_models():
            models_list.append({'name': m.name, 'supported_methods': m.supported_generation_methods})
        return jsonify(models_list)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
