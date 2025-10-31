    let map;
    let markers = [];
    let userLocation = null;
    let currentInfoWindow = null; // To keep track of the currently open info window
    
    // Default location (e.g., a major city's coordinates) if geolocation is denied or unavailable
    const DEFAULT_LATITUDE = 34.0522;
    const DEFAULT_LONGITUDE = -118.2437; // Los Angeles, CA

    function showAlert(message, type = 'success') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        document.getElementById('alert-container').appendChild(alertDiv); // Use the existing alertContainer in hospitals.html
        
        setTimeout(() => {
            alertDiv.remove();
        }, 5000); // Alerts dismiss after 5 seconds
    }

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('reminder-form')) {
// ==========================================
// REMINDER SPECIFIC JS (for reminders.html)
// ==========================================
    const reminderForm = document.getElementById('reminder-form');
    const remindersContainer = document.getElementById('reminders-container');
    const alarmSound = document.getElementById('alarm-sound');
    const alertContainer = document.getElementById('alert-container'); // Get alert container for reminders page

    let socket; 

    // Request notification permission on page load
    if ('Notification' in window) {
        Notification.requestPermission();
    }

    // Arm audio to bypass autoplay restrictions: play/pause on first user interaction
    async function armAudio() {
        if (alarmSound) {
            try {
                await alarmSound.play();
                alarmSound.pause();
                alarmSound.currentTime = 0;
                console.log("Audio armed successfully.");
            } catch (err) {
                console.warn("Could not arm audio, may require user interaction: ", err);
            }
        }
        window.removeEventListener('click', armAudio);
        window.removeEventListener('keydown', armAudio);
    }
    window.addEventListener('click', armAudio);
    window.addEventListener('keydown', armAudio);

    function playAlarmAndNotify(reminder) {
        console.log("Playing alarm and showing notification for reminder:", reminder);
        if (alarmSound) {
            alarmSound.play().catch(e => console.error("Error playing alarm sound:", e));
        }

        if (Notification.permission === 'granted') {
            new Notification('🔔 Medicine Reminder', {
                body: `Time to take your ${reminder.medicine_name}!`, 
                icon: '/static/pill.png' // You might need to add a pill.png icon
            });
        } else {
            // Use the alertContainer specific to the reminders page
            const reminderPageAlertContainer = document.getElementById('alert-container');
            if (reminderPageAlertContainer) {
                const alertDiv = document.createElement('div');
                alertDiv.className = `alert alert-info`; // Info type for reminders
                alertDiv.textContent = `Time to take your ${reminder.medicine_name}!`;
                reminderPageAlertContainer.appendChild(alertDiv);
                setTimeout(() => {
                    alertDiv.remove();
                }, 5000);
            } else {
                // Fallback if alertContainer isn't found (shouldn't happen with correct HTML)
                alert(`Time to take your ${reminder.medicine_name}!`);
            }
        }
    }

    // NOTE: This showAlert is for general purpose alerts on the *hospitals* page, if script.js is shared.
    // For reminders page specific alerts, we're handling them within playAlarmAndNotify or the form submission directly.
    // function showAlert(message, type = 'success') { ... }
    
    function formatTime(time) {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    }

    async function loadReminders() {
        try {
            const response = await fetch('/api/reminders');
            const data = await response.json();
            
            if (data.success && data.reminders.length > 0) {
                remindersContainer.innerHTML = '';
                data.reminders.forEach(reminder => {
                    addReminderToDOM(reminder);
                });
            } else {
                remindersContainer.innerHTML = `
                    <div class="no-reminders">
                        <div class="no-reminders-icon">📋</div>
                        <p>No reminders yet. Add your first reminder above!</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading reminders:', error);
            const reminderPageAlertContainer = document.getElementById('alert-container');
            if (reminderPageAlertContainer) {
                const alertDiv = document.createElement('div');
                alertDiv.className = `alert alert-error`;
                alertDiv.textContent = 'Failed to load reminders';
                reminderPageAlertContainer.appendChild(alertDiv);
                setTimeout(() => {
                    alertDiv.remove();
                }, 5000);
            }
        }
    }

    function addReminderToDOM(reminder) {
        const noReminders = remindersContainer.querySelector('.no-reminders');
        if (noReminders) {
            noReminders.remove();
        }

        const reminderCard = document.createElement('div');
        reminderCard.className = 'reminder-card';
        reminderCard.innerHTML = `
            <div class="reminder-info">
                <h3>${reminder.medicine_name}</h3>
                <div class="reminder-time">⏰ ${formatTime(reminder.reminder_time)}</div>
            </div>
            <button class="btn btn-danger" onclick="deleteReminder(${reminder.id})">Delete</button>
        `;
        remindersContainer.appendChild(reminderCard);
    }

    reminderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const medicineName = document.getElementById('medicine-name').value;
        const reminderTime = document.getElementById('reminder-time').value;

        try {
            const response = await fetch('/api/reminders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    medicine_name: medicineName,
                    reminder_time: reminderTime
                }),
            });

            const data = await response.json();

            if (data.success) {
                const reminderPageAlertContainer = document.getElementById('alert-container');
                if (reminderPageAlertContainer) {
                    const alertDiv = document.createElement('div');
                    alertDiv.className = `alert alert-success`;
                    alertDiv.textContent = 'Reminder added successfully!';
                    reminderPageAlertContainer.appendChild(alertDiv);
                    setTimeout(() => {
                        alertDiv.remove();
                    }, 5000);
                }
                addReminderToDOM(data.reminder);
                reminderForm.reset();
            } else {
                const reminderPageAlertContainer = document.getElementById('alert-container');
                if (reminderPageAlertContainer) {
                    const alertDiv = document.createElement('div');
                    alertDiv.className = `alert alert-error`;
                    alertDiv.textContent = data.error || 'Failed to add reminder';
                    reminderPageAlertContainer.appendChild(alertDiv);
                    setTimeout(() => {
                        alertDiv.remove();
                    }, 5000);
                }
            }
        } catch (error) {
            console.error('Error:', error);
            const reminderPageAlertContainer = document.getElementById('alert-container');
            if (reminderPageAlertContainer) {
                const alertDiv = document.createElement('div');
                alertDiv.className = `alert alert-error`;
                alertDiv.textContent = 'Failed to add reminder';
                reminderPageAlertContainer.appendChild(alertDiv);
                setTimeout(() => {
                    alertDiv.remove();
                }, 5000);
            }
        }
    });

    async function deleteReminder(id) {
        if (!confirm('Are you sure you want to delete this reminder?')) {
            return;
        }

        try {
            const response = await fetch(`/api/reminders/${id}`, {
                method: 'DELETE',
            });

            const data = await response.json();

            if (data.success) {
                const reminderPageAlertContainer = document.getElementById('alert-container');
                if (reminderPageAlertContainer) {
                    const alertDiv = document.createElement('div');
                    alertDiv.className = `alert alert-success`;
                    alertDiv.textContent = 'Reminder deleted successfully!';
                    reminderPageAlertContainer.appendChild(alertDiv);
                    setTimeout(() => {
                        alertDiv.remove();
                    }, 5000);
                }
                loadReminders();
            } else {
                const reminderPageAlertContainer = document.getElementById('alert-container');
                if (reminderPageAlertContainer) {
                    const alertDiv = document.createElement('div');
                    alertDiv.className = `alert alert-error`;
                    alertDiv.textContent = data.error || 'Failed to delete reminder';
                    reminderPageAlertContainer.appendChild(alertDiv);
                    setTimeout(() => {
                        alertDiv.remove();
                    }, 5000);
                }
            }
        } catch (error) {
            console.error('Error:', error);
            const reminderPageAlertContainer = document.getElementById('alert-container');
            if (reminderPageAlertContainer) {
                const alertDiv = document.createElement('div');
                alertDiv.className = `alert alert-error`;
                alertDiv.textContent = 'Failed to delete reminder';
                reminderPageAlertContainer.appendChild(alertDiv);
                setTimeout(() => {
                    alertDiv.remove();
                }, 5000);
            }
        }
    }

    // Initialize Socket.IO connection
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to Socket.IO');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Socket.IO');
    });

    socket.on('reminder_due', (data) => {
        console.log('Reminder due event received:', data);
        playAlarmAndNotify(data.reminder);
    });

    // Make deleteReminder available globally
    window.deleteReminder = deleteReminder;

    // Load reminders on page load
    loadReminders();

    } else if (document.getElementById('chat-input-form')) {
// ==========================================
// CHATBOT SPECIFIC JS (for chatbot.html)
// ==========================================
        const chatForm = document.getElementById('chat-input-form');
        const userInput = document.getElementById('user-input');
        const chatMessages = document.getElementById('chat-messages');
        // const voiceInputButton = document.getElementById('voice-input-button'); // REMOVED
        const sendButton = document.getElementById('send-button');
        const sessionId = 'user_' + Date.now();

        // let mediaRecorder;
        // let audioChunks = [];

        function addMessage(content, isUser) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = content;
            
            messageDiv.appendChild(contentDiv);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function showTypingIndicator() {
            const typingDiv = document.createElement('div');
            typingDiv.className = 'message bot';
            typingDiv.id = 'typing-indicator';
            
            const indicator = document.createElement('div');
            indicator.className = 'typing-indicator show';
            indicator.innerHTML = '<span></span><span></span><span></span>';
            
            typingDiv.appendChild(indicator);
            chatMessages.appendChild(typingDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function hideTypingIndicator() {
            const typingIndicator = document.getElementById('typing-indicator');
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }

        async function sendMessage(message) {
            if (!message) return;

            // Clear input and disable button
            userInput.value = '';
            sendButton.disabled = true;
            // voiceInputButton.disabled = true; // Disable voice button too - REMOVED
            
            // Add user message
            addMessage(message, true);
            
            // Show typing indicator
            showTypingIndicator();

            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: message,
                        session_id: sessionId
                    }),
                });

                const data = await response.json();
                
                hideTypingIndicator();

                if (data.success && data.response) {
                    addMessage(data.response, false);
                    // const audioBlob = await getSpeechFromText(data.response); // REMOVED
                    // if (audioBlob) { // REMOVED
                    //     playAudioResponse(audioBlob); // REMOVED
                    // } else { // REMOVED
                    //     console.error('Failed to get audio for bot response'); // REMOVED
                    // } // REMOVED
                } else {
                    addMessage('Sorry, I encountered an error. Please try again.', false);
                    // const audioBlob = await getSpeechFromText('Sorry, I encountered an error. Please try again.'); // REMOVED
                    // if (audioBlob) { // REMOVED
                    //     playAudioResponse(audioBlob); // REMOVED
                    // } // REMOVED
                }
            } catch (error) {
                hideTypingIndicator();
                addMessage('Sorry, I could not connect to the server. Please try again later.', false);
                console.error('Error:', error);
            } finally {
                sendButton.disabled = false;
                // voiceInputButton.disabled = false; // REMOVED
                userInput.focus();
            }
        }

        // voiceInputButton.addEventListener('click', () => { // REMOVED
        //     if (mediaRecorder && mediaRecorder.state === 'recording') { // REMOVED
        //         mediaRecorder.stop(); // REMOVED
        //         voiceInputButton.textContent = 'Speak'; // REMOVED
        //     } else { // REMOVED
        //         startRecording(); // REMOVED
        //         voiceInputButton.textContent = 'Stop Speaking'; // REMOVED
        //     } // REMOVED
        // }); // REMOVED

        // async function startRecording() { // REMOVED
        //     try { // REMOVED
        //         const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); // REMOVED
        //         mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); // REMOVED
        //         audioChunks = []; // REMOVED
        // // ... (rest of startRecording and sendAudioForTranscription) ...
        //     } catch (error) { // REMOVED
        //         console.error('Error accessing microphone:', error); // REMOVED
        //         alert('Could not access microphone. Please ensure it is connected and permissions are granted.'); // REMOVED
        //     } // REMOVED
        // } // REMOVED

        // async function sendAudioForTranscription(audioBlob) { // REMOVED
        //     const formData = new FormData(); // REMOVED
        //     formData.append('audio', audioBlob, 'audio.webm'); // REMOVED
        // // ... (rest of sendAudioForTranscription) ...
        //     } finally { // REMOVED
        //         voiceInputButton.textContent = 'Speak'; // REMOVED
        //         sendButton.disabled = false; // REMOVED
        //         voiceInputButton.disabled = false; // REMOVED
        //         userInput.focus(); // REMOVED
        //     } // REMOVED
        // } // REMOVED

        // async function getSpeechFromText(text) { // REMOVED
        //     try { // REMOVED
        //         const response = await fetch('/api/tts', { // REMOVED
        //             method: 'POST', // REMOVED
        //             headers: { // REMOVED
        //                 'Content-Type': 'application/json', // REMOVED
        //             }, // REMOVED
        //             body: JSON.stringify({ text: text }), // REMOVED
        //         }); // REMOVED
        // // ... (rest of getSpeechFromText and playAudioResponse) ...
        //     } catch (error) { // REMOVED
        //         console.error('Error fetching TTS:', error); // REMOVED
        //         return null; // REMOVED
        //     } // REMOVED
        // } // REMOVED

        // function playAudioResponse(audioBlob) { // REMOVED
        //     const audioUrl = URL.createObjectURL(audioBlob); // REMOVED
        //     const audio = new Audio(audioUrl); // REMOVED
        //     audio.play(); // REMOVED
        //     audio.onended = () => { // REMOVED
        //         URL.revokeObjectURL(audioUrl); // REMOVED
        //     }; // REMOVED
        // } // REMOVED

        sendButton.addEventListener('click', () => sendMessage(userInput.value.trim()));
        
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage(userInput.value.trim());
            }
        });

        // Focus input on load
        userInput.focus();
    } else if (document.getElementById('map')) {
// ==========================================
// HOSPITALS SPECIFIC JS (for hospitals.html)
// ==========================================
        // Hospitals specific logic (if any) could go here
    }
});


// ==========================================
// HOSPITALS SPECIFIC JS (for hospitals.html)
// ==========================================
