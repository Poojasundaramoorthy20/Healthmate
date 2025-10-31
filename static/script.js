document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-input-form');
    const userInput = document.getElementById('user-input');
    const chatMessages = document.getElementById('chat-messages');
    const voiceInputButton = document.getElementById('voice-input-button');

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = userInput.value.trim();
        if (message) {
            appendMessage(message, 'user');
            userInput.value = '';
            // Simulate bot response for now
            const botResponse = await getBotResponse(message);
            appendMessage(botResponse, 'bot');
        }
    });

    function appendMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        messageElement.textContent = message;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (sender === 'bot') {
            speakText(message);
        }
    }

    function speakText(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(utterance);
    }

    async function getBotResponse(userMessage) {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: userMessage }),
        });
        const data = await response.json();
        if (data.response) {
            return data.response;
        } else if (data.error) {
            console.error('Bot error:', data.error);
            return 'Sorry, I am having trouble understanding right now.';
        } else {
            return 'An unexpected error occurred.';
        }
    }

    const reminderList = document.getElementById('reminder-list');
    const medicineNameInput = document.getElementById('medicine-name');
    const reminderTimeInput = document.getElementById('reminder-time');
    const addReminderButton = document.getElementById('add-reminder-button');

    // Function to fetch and display reminders
    async function fetchReminders() {
        const response = await fetch('/reminders');
        const reminders = await response.json();
        reminderList.innerHTML = ''; // Clear existing reminders
        reminders.forEach(reminder => {
            appendReminder(reminder);
        });
    }

    // Function to append a single reminder to the list
    function appendReminder(reminder) {
        const reminderItem = document.createElement('div');
        reminderItem.classList.add('reminder-item');
        reminderItem.innerHTML = `
            <div class="details">
                <span class="time">${reminder.reminder_time}</span>
                <span class="medicine">${reminder.medicine_name}</span>
            </div>
            <button class="delete-reminder-button" data-id="${reminder.id}">Delete</button>
        `;
        reminderList.appendChild(reminderItem);
    }

    // Event listener for adding a reminder
    addReminderButton.addEventListener('click', async () => {
        const medicine_name = medicineNameInput.value.trim();
        const reminder_time = reminderTimeInput.value;

        if (medicine_name && reminder_time) {
            const response = await fetch('/reminders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ medicine_name, reminder_time }),
            });
            const newReminder = await response.json();
            if (newReminder.id) {
                appendReminder(newReminder);
                medicineNameInput.value = '';
                reminderTimeInput.value = '';
            } else if (newReminder.error) {
                alert(newReminder.error);
            }
        } else {
            alert('Please enter both medicine name and time.');
        }
    });

    // Event listener for deleting a reminder (using event delegation)
    reminderList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-reminder-button')) {
            const reminderId = e.target.dataset.id;
            const response = await fetch(`/reminders/${reminderId}`, {
                method: 'DELETE',
            });
            const result = await response.json();
            if (result.message) {
                e.target.closest('.reminder-item').remove();
            } else if (result.error) {
                alert(result.error);
            }
        }
    });

    // Initial fetch of reminders when the page loads
    fetchReminders();

    // Get references for emergency assistance elements
    const findHospitalsButton = document.getElementById('find-hospitals-button');
    const hospitalResultsDiv = document.getElementById('hospital-results');

    // Event listener for finding hospitals
    findHospitalsButton.addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;
                hospitalResultsDiv.innerHTML = 'Searching for nearby hospitals...';

                try {
                    const response = await fetch('/find_hospitals', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ latitude, longitude }),
                    });
                    const data = await response.json();

                    if (data.hospitals && data.hospitals.length > 0) {
                        hospitalResultsDiv.innerHTML = '';
                        data.hospitals.forEach(hospital => {
                            const hospitalItem = document.createElement('div');
                            hospitalItem.classList.add('hospital-item');
                            hospitalItem.innerHTML = `
                                <div class="name">${hospital.name}</div>
                                <div class="address">${hospital.address}</div>
                                ${hospital.rating ? `<div class="rating">Rating: ${hospital.rating}</div>` : ''}
                            `;
                            hospitalResultsDiv.appendChild(hospitalItem);
                        });
                    } else if (data.error) {
                        hospitalResultsDiv.innerHTML = `<p style="color: red;">${data.error}</p>`;
                        console.error('Error finding hospitals:', data.error);
                    } else {
                        hospitalResultsDiv.innerHTML = '<p>No hospitals or clinics found nearby.</p>';
                    }
                } catch (error) {
                    hospitalResultsDiv.innerHTML = '<p style="color: red;">Error fetching hospital data.</p>';
                    console.error('Fetch error:', error);
                }
            }, (error) => {
                console.error('Geolocation error:', error);
                hospitalResultsDiv.innerHTML = '<p style="color: red;">Unable to retrieve your location. Please ensure location services are enabled.</p>';
            });
        } else {
            hospitalResultsDiv.innerHTML = '<p style="color: red;">Geolocation is not supported by this browser.</p>';
        }
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = SpeechRecognition ? new SpeechRecognition() : null;

    if (recognition) {
        recognition.continuous = false;
        recognition.lang = 'en-US';

        voiceInputButton.addEventListener('click', () => {
            recognition.start();
            voiceInputButton.textContent = '🔴 Speaking...';
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
            voiceInputButton.textContent = '🎙️';
            chatForm.dispatchEvent(new Event('submit')); // Automatically send the message
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            voiceInputButton.textContent = '🎙️';
            alert('Voice input error: ' + event.error);
        };
    } else {
        voiceInputButton.style.display = 'none'; // Hide button if not supported
        console.warn('Speech Recognition not supported in this browser.');
    }

    // Function to check for and trigger notifications
    function checkRemindersForNotifications() {
        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2, '0');
        const currentMinute = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${currentHour}:${currentMinute}`;

        // Fetch reminders from the backend (or use a local copy if available)
        fetch('/reminders')
            .then(response => response.json())
            .then(reminders => {
                reminders.forEach(reminder => {
                    // Simple check for now: if reminder_time matches current time
                    if (reminder.reminder_time === currentTime) {
                        if (!localStorage.getItem(`reminder-${reminder.id}-${currentTime}`)) {
                            showNotification(`Time to take your ${reminder.medicine_name}!`, `It's ${reminder.reminder_time}.`);
                            localStorage.setItem(`reminder-${reminder.id}-${currentTime}`, 'notified');
                        }
                    }
                });
            })
            .catch(error => console.error('Error fetching reminders for notification:', error));
    }

    // Function to show a browser notification
    function showNotification(title, body) {
        if (!('Notification' in window)) {
            console.warn('This browser does not support desktop notification');
        } else if (Notification.permission === 'granted') {
            new Notification(title, { body: body });
            playNotificationSound();
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification(title, { body: body });
                    playNotificationSound();
                }
            });
        }
    }

    // Function to play a notification sound
    function playNotificationSound() {
        // You can replace this with a proper audio file if needed
        const audio = new Audio('https://www.soundjay.com/buttons/beep-07.wav'); // Example sound
        audio.play().catch(e => console.error('Error playing sound:', e));
    }

    // Check reminders every minute
    setInterval(checkRemindersForNotifications, 60 * 1000);

    // Request notification permission on page load
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});

function addReminder() {
    const name = document.getElementById('medicineName').value;
    const time = document.getElementById('reminderTime').value;
  
    fetch('/add_reminder', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ name: name, time: time })
    })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      loadReminders();
    });
  }
  
  function loadReminders() {
    fetch('/get_reminders')
      .then(res => res.json())
      .then(reminders => {
        const list = document.getElementById('reminderList');
        list.innerHTML = '';
        reminders.forEach(r => {
          list.innerHTML += `<li>${r.name} at ${r.time}</li>`;
        });
      });
  }
  