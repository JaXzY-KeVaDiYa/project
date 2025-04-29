document.addEventListener("DOMContentLoaded", function () {
    // Tab Navigation
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            // Remove active class from all buttons and contents
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to current button and content
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    //==================================================
    // VOICE CHANGER FUNCTIONALITY
    //==================================================
    
    // DOM Elements
    const recordBtn = document.getElementById('record-btn');
    const stopBtn = document.getElementById('stop-btn');
    const playBtn = document.getElementById('play-btn');
    const voiceSelect = document.getElementById('voice-select');
    const statusElement = document.getElementById('status');
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');

    // Set canvas size to match container
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Audio Variables
    let audioContext;
    let mediaRecorder;
    let audioChunks = [];
    let audioBuffer = null;
    let analyser;
    let source;
    let animationId;
    let recordingStream;

    // Initialize Audio Context
    function initAudio() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
        }
    }

    // Setup Audio Visualization
    function setupVisualization(audioNode) {
        // Clear previous visualization
        if (animationId) {
            cancelAnimationFrame(animationId);
        }

        audioNode.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function draw() {
            animationId = requestAnimationFrame(draw);

            analyser.getByteTimeDomainData(dataArray);
            canvasCtx.fillStyle = "rgb(248, 249, 250)";
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = "rgb(52, 152, 219)";
            canvasCtx.beginPath();

            let sliceWidth = canvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * canvas.height / 2;
                i === 0 ? canvasCtx.moveTo(x, y) : canvasCtx.lineTo(x, y);
                x += sliceWidth;
            }

            canvasCtx.lineTo(canvas.width, canvas.height / 2);
            canvasCtx.stroke();
        }

        draw();
    }

    // Frequency Visualization
    function setupFrequencyVisualization(audioNode) {
        // Clear previous visualization
        if (animationId) {
            cancelAnimationFrame(animationId);
        }

        audioNode.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function draw() {
            animationId = requestAnimationFrame(draw);

            analyser.getByteFrequencyData(dataArray);
            canvasCtx.fillStyle = "rgb(248, 249, 250)";
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] / 2;
                
                // Create gradient for bars
                const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
                gradient.addColorStop(0, '#3498db');
                gradient.addColorStop(1, '#2ecc71');
                
                canvasCtx.fillStyle = gradient;
                canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

                x += barWidth + 1;
            }
        }

        draw();
    }

    // Stop Visualization
    function stopVisualization() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            animationId = null;
        }
    }

    // Record Audio
    if (recordBtn) {
        recordBtn.addEventListener("click", async () => {
            try {
                initAudio();
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                recordingStream = stream;

                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
                    const arrayBuffer = await audioBlob.arrayBuffer();

                    audioContext.decodeAudioData(arrayBuffer, (buffer) => {
                        audioBuffer = buffer;
                        
                        playBtn.disabled = false;
                        statusElement.textContent = "Voice recorded! Ready to apply effect.";
                        statusElement.classList.remove('recording');
                    });

                    // Stop the microphone stream tracks
                    if (recordingStream) {
                        recordingStream.getTracks().forEach(track => track.stop());
                    }
                    
                    stopVisualization();
                };

                mediaRecorder.start();
                recordBtn.disabled = true;
                stopBtn.disabled = false;
                playBtn.disabled = true;
                statusElement.textContent = "Recording...";
                statusElement.classList.add('recording');

                // Create source from stream for visualization
                const audioSource = audioContext.createMediaStreamSource(stream);
                setupFrequencyVisualization(audioSource);
                
            } catch (error) {
                console.error("Error accessing microphone:", error);
                statusElement.textContent = "Error: Microphone access denied";
            }
        });
    }

    // Stop Recording
    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
                recordBtn.disabled = false;
                stopBtn.disabled = true;
                statusElement.textContent = "Processing audio...";
            }
        });
    }

    // Apply Voice Effect and Play
    if (playBtn) {
        playBtn.addEventListener("click", async () => {
            if (!audioBuffer) {
                console.log("No audio recorded!");
                statusElement.textContent = "No audio recorded!";
                return;
            }

            // Ensure AudioContext is active
            if (audioContext.state === "suspended") {
                await audioContext.resume();
            }

            // Stop any playing audio
            if (source) {
                source.stop();
                source.disconnect();
            }

            // Create new source from audio buffer
            source = audioContext.createBufferSource();
            source.buffer = audioBuffer;

            // Create effects chain based on selected voice
            const selectedVoice = voiceSelect.value;
            const { node: effectNode, input: effectInput } = createVoiceEffect(selectedVoice);

            source.connect(effectInput);
            effectNode.connect(audioContext.destination);

            setupVisualization(effectNode);

            
            // Play the audio
            source.start(0);
            statusElement.textContent = `Playing with "${selectedVoice}" effect`;
            
            // Enable/disable buttons during playback
            playBtn.disabled = true;
            
            source.onended = function() {
                playBtn.disabled = false;
                statusElement.textContent = "Ready to play";
                stopVisualization();
            };
        });
    }

    function createVoiceEffect(effectType) {
        const destination = audioContext.createGain();
    
        switch (effectType) {
            case "robot": {
                const input = audioContext.createGain();
                const osc = audioContext.createOscillator();
                const modulator = audioContext.createGain();
                const ringModOutput = audioContext.createGain();
    
                osc.frequency.value = 50;
                modulator.gain.value = 0.5;
    
                input.connect(ringModOutput);
                osc.connect(modulator);
                modulator.connect(ringModOutput.gain);
                ringModOutput.connect(destination);
                osc.start();
    
                return { node: destination, input: input };
            }
    
            case "chipmunk": {
                const highpassFilter = audioContext.createBiquadFilter();
                highpassFilter.type = "highpass";
                highpassFilter.frequency.value = 500;
    
                if (source) source.playbackRate.value = 1.5;
    
                highpassFilter.connect(destination);
                return { node: destination, input: highpassFilter };
            }
    
            case "deep": {
                const lowShelfFilter = audioContext.createBiquadFilter();
                lowShelfFilter.type = "lowshelf";
                lowShelfFilter.frequency.value = 300;
                lowShelfFilter.gain.value = 10;
    
                if (source) source.playbackRate.value = 0.7;
    
                lowShelfFilter.connect(destination);
                return { node: destination, input: lowShelfFilter };
            }
    
            case "echo": {
                const input = audioContext.createGain();
                const delay = audioContext.createDelay();
                const feedback = audioContext.createGain();
                const wetGain = audioContext.createGain();
                const dryGain = audioContext.createGain();
                const merger = audioContext.createGain();
    
                delay.delayTime.value = 0.3;
                feedback.gain.value = 0.5;
                wetGain.gain.value = 0.5;
                dryGain.gain.value = 1.0;
    
                input.connect(dryGain);
                input.connect(delay);
                delay.connect(feedback);
                feedback.connect(delay);
                delay.connect(wetGain);
                dryGain.connect(merger);
                wetGain.connect(merger);
                merger.connect(destination);
    
                return { node: destination, input: input };
            }
           
            default:
                return { node: destination, input: destination };
        }
    }
    

    //==================================================
    // IMAGE TO TEXT FUNCTIONALITY
    //==================================================
    
    // DOM Elements for Image to Text
    const uploadArea = document.getElementById('upload-area');
    const imageUpload = document.getElementById('image-upload');
    const previewContainer = document.getElementById('image-preview-container');
    const previewImage = document.getElementById('preview-image');
    const removeImageBtn = document.getElementById('remove-image');
    const extractTextBtn = document.getElementById('extract-text-btn');
    const textResults = document.getElementById('text-results');
    const extractedTextArea = document.getElementById('extracted-text');
    const copyTextBtn = document.getElementById('copy-text-btn');
    const sendToTtsBtn = document.getElementById('send-to-tts-btn');
    
    // Handle drag and drop
    if (uploadArea) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, highlight, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, unhighlight, false);
        });
        
        function highlight() {
            uploadArea.classList.add('highlight');
        }
        
        function unhighlight() {
            uploadArea.classList.remove('highlight');
        }
        
        uploadArea.addEventListener('drop', handleDrop, false);
        
        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleFiles(files);
        }
        
        uploadArea.addEventListener('click', () => {
            imageUpload.click();
        });
        
        imageUpload.addEventListener('change', () => {
            handleFiles(imageUpload.files);
        });
        
        function handleFiles(files) {
            if (files.length > 0) {
                const file = files[0];
                if (!file.type.match('image.*')) {
                    alert('Please select an image file');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    previewImage.src = e.target.result;
                    uploadArea.style.display = 'none';
                    previewContainer.style.display = 'flex';
                    textResults.style.display = 'none'; // Hide results if they were shown
                };
                reader.readAsDataURL(file);
            }
        }
        
        // Remove image
        removeImageBtn.addEventListener('click', () => {
            previewImage.src = '';
            uploadArea.style.display = 'flex';
            previewContainer.style.display = 'none';
            textResults.style.display = 'none';
            imageUpload.value = '';
        });
        
  // Extract text from image
extractTextBtn.addEventListener('click', () => {
    // Show processing state
    extractTextBtn.textContent = 'Processing...';
    extractTextBtn.disabled = true;
    
    // Convert image to canvas first to ensure compatibility
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions to match the image
    canvas.width = previewImage.naturalWidth;
    canvas.height = previewImage.naturalHeight;
    
    // Draw the image onto the canvas
    ctx.drawImage(previewImage, 0, 0);
    
    // Get the image data as PNG (more compatible format)
    try {
        // Create a new image with canvas data to ensure it's properly loaded
        const imageData = canvas.toDataURL('image/png');
        const processImage = new Image();
        
        processImage.onload = function() {
            // Now process with Tesseract
            Tesseract.recognize(
                processImage,
                'eng',
                { 
                    logger: m => {
                        console.log(m);
                        if (m.status === 'recognizing text') {
                            const progress = Math.round(m.progress * 100);
                            extractTextBtn.textContent = `Processing... ${progress}%`;
                        }
                    }
                }
            ).then(result => {
                // Success - update UI with extracted text
                console.log('Extraction successful');
                extractedTextArea.value = result.data.text || 'No text found in image';
                textResults.style.display = 'block';
                extractTextBtn.textContent = 'Extract Text';
                extractTextBtn.disabled = false;
            }).catch(err => {
                // Error handling
                console.error('OCR Processing Error:', err);
                extractedTextArea.value = 'Error processing the image. Please try again.';
                textResults.style.display = 'block';
                extractTextBtn.textContent = 'Extract Text';
                extractTextBtn.disabled = false;
            });
        };
        
        processImage.onerror = function() {
            console.error('Error loading processed image');
            extractedTextArea.value = 'Error processing the image. Please try again.';
            textResults.style.display = 'block';
            extractTextBtn.textContent = 'Extract Text';
            extractTextBtn.disabled = false;
        };
        
        // Set the source to start loading
        processImage.src = imageData;
        
    } catch (err) {
        console.error('Canvas Error:', err);
        extractedTextArea.value = 'Error processing the image. Please try again.';
        textResults.style.display = 'block';
        extractTextBtn.textContent = 'Extract Text';
        extractTextBtn.disabled = false;
    }
});
        
        // Copy extracted text
        copyTextBtn.addEventListener('click', () => {
            extractedTextArea.select();
            document.execCommand('copy');
            
            const originalText = copyTextBtn.textContent;
            copyTextBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyTextBtn.textContent = originalText;
            }, 1500);
        });
        
        // Send text to TTS tab
        sendToTtsBtn.addEventListener('click', () => {
            const extractedText = extractedTextArea.value;
            const speechTextArea = document.getElementById('speech-text');
            
            // Switch to TTS tab and populate the text area
            const ttsTabBtn = document.querySelector('[data-tab="text-to-speech"]');
            ttsTabBtn.click();
            
            speechTextArea.value = extractedText;
            updateCharCount();
        });
    }

    //==================================================
    // TEXT TO SPEECH FUNCTIONALITY
    //==================================================
    
    // DOM Elements for Text to Speech
    const ttsVoiceSelect = document.getElementById('tts-voice');
    const ttsRateInput = document.getElementById('tts-rate');
    const ttsPitchInput = document.getElementById('tts-pitch');
    const rateValueSpan = document.getElementById('rate-value');
    const pitchValueSpan = document.getElementById('pitch-value');
    const speechTextArea = document.getElementById('speech-text');
    const charCountSpan = document.getElementById('char-count');
    const speakBtn = document.getElementById('speak-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopSpeechBtn = document.getElementById('stop-speech-btn');
    const downloadAudioBtn = document.getElementById('download-audio-btn');
    
    // TTS variables
    let speechSynthesis = window.speechSynthesis;
    let currentUtterance = null;
    let isSpeaking = false;
    let isPaused = false;
    
    // Initialize TTS voices
    function populateVoiceList() {
        if (ttsVoiceSelect) {
            // Clear existing options
            ttsVoiceSelect.innerHTML = '';
            
            // Get available voices
            const voices = speechSynthesis.getVoices();
            
            // Add voices to select element
            voices.forEach(voice => {
                const option = document.createElement('option');
                option.textContent = `${voice.name} (${voice.lang})`;
                option.value = voice.name;
                ttsVoiceSelect.appendChild(option);
            });
            
            // If no voices are available yet, wait for the voiceschanged event
            if (voices.length === 0) {
                speechSynthesis.addEventListener('voiceschanged', populateVoiceList);
            }
        }
    }
    
    // Call populateVoiceList on page load
    if (speechSynthesis) {
        populateVoiceList();
    }
    
    // Update rate and pitch displays
    if (ttsRateInput) {
        ttsRateInput.addEventListener('input', () => {
            rateValueSpan.textContent = ttsRateInput.value;
        });
    }
    
    if (ttsPitchInput) {
        ttsPitchInput.addEventListener('input', () => {
            pitchValueSpan.textContent = ttsPitchInput.value;
        });
    }
    
    // Update character count
    function updateCharCount() {
        if (speechTextArea && charCountSpan) {
            charCountSpan.textContent = speechTextArea.value.length;
        }
    }
    
    if (speechTextArea) {
        speechTextArea.addEventListener('input', updateCharCount);
    }
    
    // Speak text
    if (speakBtn) {
        speakBtn.addEventListener('click', () => {
            const text = speechTextArea.value;
            
            if (!text) {
                alert('Please enter text to speak');
                return;
            }
            
            // Cancel any current speech
            speechSynthesis.cancel();
            
            // Create new utterance
            currentUtterance = new SpeechSynthesisUtterance(text);
            
            // Set voice
            const voices = speechSynthesis.getVoices();
            const selectedVoice = voices.find(voice => voice.name === ttsVoiceSelect.value);
            if (selectedVoice) {
                currentUtterance.voice = selectedVoice;
            }
            
            // Set rate and pitch
            currentUtterance.rate = parseFloat(ttsRateInput.value);
            currentUtterance.pitch = parseFloat(ttsPitchInput.value);
            
            // Set event handlers
            currentUtterance.onstart = () => {
                isSpeaking = true;
                isPaused = false;
                updateTtsButtonState();
            };
            
            currentUtterance.onend = () => {
                isSpeaking = false;
                isPaused = false;
                updateTtsButtonState();
            };
            
            currentUtterance.onerror = (event) => {
                console.error('SpeechSynthesis error:', event);
                isSpeaking = false;
                isPaused = false;
                updateTtsButtonState();
            };
            
            // Start speaking
            speechSynthesis.speak(currentUtterance);
        });
    }
    
    // Pause/Resume speech
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (!isPaused) {
                speechSynthesis.pause();
                isPaused = true;
                pauseBtn.textContent = 'Resume';
            } else {
                speechSynthesis.resume();
                isPaused = false;
                pauseBtn.textContent = 'Pause';
            }
        });
    }
    
    // Stop speech
    if (stopSpeechBtn) {
        stopSpeechBtn.addEventListener('click', () => {
            speechSynthesis.cancel();
            isSpeaking = false;
            isPaused = false;
            updateTtsButtonState();
        });
    }
    
    // Update TTS button states
    function updateTtsButtonState() {
        if (isSpeaking) {
            speakBtn.disabled = true;
            pauseBtn.disabled = false;
            stopSpeechBtn.disabled = false;
            downloadAudioBtn.disabled = false;
        } else {
            speakBtn.disabled = false;
            pauseBtn.disabled = true;
            stopSpeechBtn.disabled = true;
            pauseBtn.textContent = 'Pause';
            
            // Keep download button enabled if we have speech
            downloadAudioBtn.disabled = !speechTextArea.value;
        }
    }
    
    // Download audio (using RecordRTC to record TTS output)
    if (downloadAudioBtn) {
        downloadAudioBtn.addEventListener('click', () => {
            alert("Audio download functionality requires a RecordRTC or similar library to capture the audio output. In a full implementation, this would record the speech synthesis output and save it as an audio file.");
        });
    }
    
    // Initialize TTS UI
    function initTtsUI() {
        updateCharCount();
        updateTtsButtonState();
    }
    
    // Call initialization functions
    initTtsUI();





    // Add this inside the document.addEventListener("DOMContentLoaded", function () { ... }) block

//==================================================
// TRANSLATION FUNCTIONALITY FOR TEXT TO SPEECH
//==================================================

// DOM Elements for Translation
const sourceLanguageSelect = document.getElementById('source-language');
const targetLanguageSelect = document.getElementById('target-language');
const translateBtn = document.getElementById('translate-btn');
const translationResult = document.createElement('div');
translationResult.className = 'translation-result';
translationResult.innerHTML = '<h4>Translation</h4><div id="translated-text"></div>';

// Insert after text input area
if (document.querySelector('.text-input-area')) {
  document.querySelector('.text-input-area').after(translationResult);
}

// Update speech text with translation
let translatedText = '';

// Handle translation
if (translateBtn) {
  translateBtn.addEventListener('click', async () => {
    const text = document.getElementById('speech-text').value;
    
    if (!text) {
      alert('Please enter text to translate');
      return;
    }
    
    const sourceLang = sourceLanguageSelect.value;
    const targetLang = targetLanguageSelect.value;
    
    // Show loading state
    translateBtn.disabled = true;
    translateBtn.textContent = 'Translating...';
    
    try {
      // Call translation API
      const translation = await translateText(text, sourceLang, targetLang);

      // Display translation
      translatedText = translation;
      document.getElementById('translated-text').textContent = translatedText;
      translationResult.style.display = 'block';
      
      // Reset button
      translateBtn.disabled = false;
      translateBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l5 5 5-5"></path><path d="M12 3v10"></path><path d="M3 21h18"></path></svg> Translate';
    } catch (error) {
      console.error('Translation error:', error);
      alert('Error during translation. Please try again.');
      
      // Reset button
      translateBtn.disabled = false;
      translateBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l5 5 5-5"></path><path d="M12 3v10"></path><path d="M3 21h18"></path></svg> Translate';
    }
  });
}

// Mock translation function (replace with actual API call in production)
async function translateText(text, sourceLang, targetLang) {
    try {
      const response = await fetch('http://localhost:8000/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          from: sourceLang,
          to: targetLang
        })
      });
 
      if (!response.ok) {
        throw new Error('Translation API error');
      }
 
      const data = await response.json();
      console.log('API Response:', data);  // Log the response to check
 
      return data.translatedText; // <-- Change this to access 'translatedText' instead of 'result'
    } catch (error) {
      console.error('Error calling translate API:', error);
      throw error;
    }
 }
 
  
// New button for speaking translation
// New button for speaking translation
const speakTranslationBtn = document.getElementById('speak-translation-btn');

// Add a click listener to the Speak Translation button
if (speakTranslationBtn) {
  speakTranslationBtn.addEventListener('click', () => {
    const textToSpeak = translatedText; // The translated text

    if (!textToSpeak) {
      alert('No translation available to speak');
      return;
    }

    // Cancel any current speech
    speechSynthesis.cancel();

    // Create new utterance for the translated text
    const currentUtterance = new SpeechSynthesisUtterance(textToSpeak);

    // Get the target language selected by the user
    const targetLang = targetLanguageSelect.value;

    // Set the language for the translated text
    currentUtterance.lang = targetLang;

    // Find a voice that matches the selected language
    const voices = speechSynthesis.getVoices();
    const selectedVoice = voices.find(voice => voice.lang.startsWith(targetLang));
    
    if (selectedVoice) {
      currentUtterance.voice = selectedVoice;
    } else {
      // Fallback to a default voice if no matching voice is found
      currentUtterance.voice = voices[0]; // Default to the first available voice
    }

    // Set rate and pitch based on the user's settings
    currentUtterance.rate = parseFloat(ttsRateInput.value);
    currentUtterance.pitch = parseFloat(ttsPitchInput.value);

    // Set event handlers
    currentUtterance.onstart = () => {
      isSpeaking = true;
      isPaused = false;
      updateTtsButtonState();
    };

    currentUtterance.onend = () => {
      isSpeaking = false;
      isPaused = false;
      updateTtsButtonState();
    };

    currentUtterance.onerror = (event) => {
      console.error('SpeechSynthesis error:', event);
      isSpeaking = false;
      isPaused = false;
      updateTtsButtonState();
    };

    // Start speaking the translated text
    speechSynthesis.speak(currentUtterance);
  });
}






});


