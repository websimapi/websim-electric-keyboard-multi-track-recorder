class ElectricKeyboard {
    constructor() {
        this.audioContext = null;
        this.tracks = [];
        this.activeNotes = new Map();
        this.currentOctave = 4;
        this.waveform = 'sine';
        this.attack = 0.1;
        this.release = 0.3;
        this.masterVolume = 0.5;
        this.recordingTrack = null;
        this.playingTracks = new Set();
        
        this.init();
    }

    async init() {
        await this.initAudio();
        this.setupKeyboard();
        this.setupControls();
        this.setupKeyboardListeners();
        this.addTrack(); // Add first track by default
    }

    async initAudio() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create master gain node
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
        this.masterGain.gain.value = this.masterVolume;
    }

    setupKeyboard() {
        const keyboard = document.getElementById('keyboard');
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const keyboardMap = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm'];
        
        for (let octave = 3; octave <= 5; octave++) {
            for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                const key = document.createElement('div');
                key.className = `key ${note.includes('#') ? 'black' : 'white'}`;
                key.dataset.note = `${note}${octave}`;
                key.dataset.freq = this.noteToFreq(`${note}${octave}`);
                
                // Add keyboard shortcut label for middle octave
                if (octave === 4 && i < keyboardMap.length) {
                    key.innerHTML = keyboardMap[i].toUpperCase();
                }
                
                key.addEventListener('mousedown', (e) => this.startNote(e.target));
                key.addEventListener('mouseup', (e) => this.stopNote(e.target));
                key.addEventListener('mouseleave', (e) => this.stopNote(e.target));
                
                keyboard.appendChild(key);
            }
        }
    }

    setupControls() {
        // Master controls
        document.getElementById('playAll').addEventListener('click', () => this.playAllTracks());
        document.getElementById('stopAll').addEventListener('click', () => this.stopAllTracks());
        document.getElementById('masterVolume').addEventListener('input', (e) => {
            this.masterVolume = e.target.value / 100;
            this.masterGain.gain.value = this.masterVolume;
            document.getElementById('volumeDisplay').textContent = `${e.target.value}%`;
        });

        // Keyboard controls
        document.getElementById('octaveDown').addEventListener('click', () => this.changeOctave(-1));
        document.getElementById('octaveUp').addEventListener('click', () => this.changeOctave(1));
        document.getElementById('waveform').addEventListener('change', (e) => {
            this.waveform = e.target.value;
        });
        document.getElementById('attack').addEventListener('input', (e) => {
            this.attack = parseFloat(e.target.value);
        });
        document.getElementById('release').addEventListener('input', (e) => {
            this.release = parseFloat(e.target.value);
        });

        // Track controls
        document.getElementById('addTrack').addEventListener('click', () => this.addTrack());
    }

    setupKeyboardListeners() {
        const keyMap = {
            'z': 'C4', 's': 'C#4', 'x': 'D4', 'd': 'D#4', 'c': 'E4',
            'v': 'F4', 'g': 'F#4', 'b': 'G4', 'h': 'G#4', 'n': 'A4',
            'j': 'A#4', 'm': 'B4'
        };

        const pressedKeys = new Set();

        document.addEventListener('keydown', (e) => {
            if (pressedKeys.has(e.key)) return;
            pressedKeys.add(e.key);

            if (e.key === 'q') this.changeOctave(-1);
            if (e.key === 'w') this.changeOctave(1);

            const note = keyMap[e.key.toLowerCase()];
            if (note) {
                const adjustedNote = note.replace('4', this.currentOctave);
                const keyElement = document.querySelector(`[data-note="${adjustedNote}"]`);
                if (keyElement) this.startNote(keyElement);
            }
        });

        document.addEventListener('keyup', (e) => {
            pressedKeys.delete(e.key);
            
            const note = keyMap[e.key.toLowerCase()];
            if (note) {
                const adjustedNote = note.replace('4', this.currentOctave);
                const keyElement = document.querySelector(`[data-note="${adjustedNote}"]`);
                if (keyElement) this.stopNote(keyElement);
            }
        });
    }

    noteToFreq(note) {
        const noteMap = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
        const octave = parseInt(note.slice(-1));
        const noteName = note.slice(0, -1);
        const semitone = noteMap[noteName];
        return 440 * Math.pow(2, (octave - 4) + (semitone - 9) / 12);
    }

    startNote(keyElement) {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const note = keyElement.dataset.note;
        const freq = parseFloat(keyElement.dataset.freq);
        
        if (this.activeNotes.has(note)) return;

        keyElement.classList.add('active');

        // Create oscillator
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = this.waveform;
        oscillator.frequency.value = freq;
        
        // ADSR envelope
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + this.attack);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        oscillator.start();
        
        this.activeNotes.set(note, { oscillator, gainNode, keyElement });

        // Record if actively recording
        if (this.recordingTrack) {
            this.recordingTrack.recordNote(note, freq, this.audioContext.currentTime);
        }
    }

    stopNote(keyElement) {
        const note = keyElement.dataset.note;
        const noteData = this.activeNotes.get(note);
        
        if (!noteData) return;

        keyElement.classList.remove('active');
        
        const { oscillator, gainNode } = noteData;
        
        // Release
        gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + this.release);
        
        oscillator.stop(this.audioContext.currentTime + this.release);
        
        this.activeNotes.delete(note);

        // Record note end if actively recording
        if (this.recordingTrack) {
            this.recordingTrack.recordNoteEnd(note, this.audioContext.currentTime);
        }
    }

    changeOctave(direction) {
        this.currentOctave = Math.max(1, Math.min(7, this.currentOctave + direction));
        document.getElementById('octaveDisplay').textContent = this.currentOctave;
    }

    addTrack() {
        const track = new Track(this.tracks.length + 1, this);
        this.tracks.push(track);
        this.renderTracks();
    }

    removeTrack(track) {
        const index = this.tracks.indexOf(track);
        if (index > -1) {
            track.stop();
            this.tracks.splice(index, 1);
            this.renderTracks();
        }
    }

    renderTracks() {
        const tracksList = document.getElementById('tracksList');
        tracksList.innerHTML = '';
        
        this.tracks.forEach(track => {
            tracksList.appendChild(track.element);
        });
    }

    playAllTracks() {
        this.tracks.forEach(track => {
            if (track.hasRecording && !track.isPlaying) {
                track.play();
            }
        });
    }

    stopAllTracks() {
        this.tracks.forEach(track => track.stop());
    }
}

class Track {
    constructor(number, keyboard) {
        this.number = number;
        this.keyboard = keyboard;
        this.recording = [];
        this.isRecording = false;
        this.isPlaying = false;
        this.hasRecording = false;
        this.label = `Track ${number}`;
        this.startTime = 0;
        this.duration = 0;
        this.playbackTimeouts = [];
        
        this.createElement();
    }

    createElement() {
        this.element = document.createElement('div');
        this.element.className = 'track';
        
        this.element.innerHTML = `
            <div class="track-info">
                <div class="track-name">${this.label}</div>
                <div class="track-duration">Duration: ${this.formatTime(this.duration)}</div>
            </div>
            <div class="track-controls">
                <input type="text" class="track-label" value="${this.label}" placeholder="Track name...">
                <button class="btn btn-warning record-btn">
                    <span class="icon">⏺</span>
                    Record
                </button>
                <button class="btn btn-success play-btn" ${!this.hasRecording ? 'disabled' : ''}>
                    <span class="icon">▶</span>
                    Play
                </button>
                <button class="btn btn-danger stop-btn">
                    <span class="icon">⏹</span>
                    Stop
                </button>
                <button class="btn btn-secondary delete-btn">
                    <span class="icon">🗑</span>
                    Delete
                </button>
            </div>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const labelInput = this.element.querySelector('.track-label');
        const recordBtn = this.element.querySelector('.record-btn');
        const playBtn = this.element.querySelector('.play-btn');
        const stopBtn = this.element.querySelector('.stop-btn');
        const deleteBtn = this.element.querySelector('.delete-btn');

        labelInput.addEventListener('input', (e) => {
            this.label = e.target.value || `Track ${this.number}`;
            this.element.querySelector('.track-name').textContent = this.label;
        });

        recordBtn.addEventListener('click', () => this.toggleRecord());
        playBtn.addEventListener('click', () => this.play());
        stopBtn.addEventListener('click', () => this.stop());
        deleteBtn.addEventListener('click', () => this.keyboard.removeTrack(this));
    }

    toggleRecord() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    startRecording() {
        this.isRecording = true;
        this.recording = [];
        this.startTime = this.keyboard.audioContext.currentTime;
        this.keyboard.recordingTrack = this;
        
        this.element.classList.add('recording');
        this.element.querySelector('.record-btn').innerHTML = '<span class="icon">⏹</span> Stop Recording';
        
        console.log(`Started recording ${this.label}`);
    }

    stopRecording() {
        this.isRecording = false;
        this.keyboard.recordingTrack = null;
        this.hasRecording = this.recording.length > 0;
        this.duration = this.keyboard.audioContext.currentTime - this.startTime;
        
        this.element.classList.remove('recording');
        this.element.querySelector('.record-btn').innerHTML = '<span class="icon">⏺</span> Record';
        this.element.querySelector('.play-btn').disabled = !this.hasRecording;
        this.element.querySelector('.track-duration').textContent = `Duration: ${this.formatTime(this.duration)}`;
        
        console.log(`Stopped recording ${this.label}. Recorded ${this.recording.length} events.`);
    }

    recordNote(note, freq, time) {
        this.recording.push({
            type: 'noteOn',
            note,
            freq,
            time: time - this.startTime
        });
    }

    recordNoteEnd(note, time) {
        this.recording.push({
            type: 'noteOff',
            note,
            time: time - this.startTime
        });
    }

    play() {
        if (!this.hasRecording || this.isPlaying) return;
        
        this.isPlaying = true;
        this.element.classList.add('playing');
        this.element.querySelector('.play-btn').innerHTML = '<span class="icon">⏸</span> Playing';
        
        const startTime = this.keyboard.audioContext.currentTime;
        
        this.recording.forEach(event => {
            const timeout = setTimeout(() => {
                if (event.type === 'noteOn') {
                    this.playNote(event.note, event.freq);
                } else if (event.type === 'noteOff') {
                    this.stopNote(event.note);
                }
            }, event.time * 1000);
            
            this.playbackTimeouts.push(timeout);
        });
        
        // Auto-stop when recording ends
        const endTimeout = setTimeout(() => {
            this.stop();
        }, this.duration * 1000);
        
        this.playbackTimeouts.push(endTimeout);
        
        console.log(`Playing ${this.label}`);
    }

    playNote(note, freq) {
        if (this.keyboard.audioContext.state === 'suspended') {
            this.keyboard.audioContext.resume();
        }

        // Create oscillator for playback
        const oscillator = this.keyboard.audioContext.createOscillator();
        const gainNode = this.keyboard.audioContext.createGain();
        
        oscillator.type = this.keyboard.waveform;
        oscillator.frequency.value = freq;
        
        gainNode.gain.setValueAtTime(0, this.keyboard.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, this.keyboard.audioContext.currentTime + this.keyboard.attack);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.keyboard.masterGain);
        
        oscillator.start();
        
        // Store for stopping
        if (!this.playingNotes) this.playingNotes = new Map();
        this.playingNotes.set(note, { oscillator, gainNode });

        // Visual feedback
        const keyElement = document.querySelector(`[data-note="${note}"]`);
        if (keyElement) keyElement.classList.add('active');
    }

    stopNote(note) {
        if (!this.playingNotes) return;
        
        const noteData = this.playingNotes.get(note);
        if (!noteData) return;
        
        const { oscillator, gainNode } = noteData;
        
        gainNode.gain.cancelScheduledValues(this.keyboard.audioContext.currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, this.keyboard.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, this.keyboard.audioContext.currentTime + this.keyboard.release);
        
        oscillator.stop(this.keyboard.audioContext.currentTime + this.keyboard.release);
        
        this.playingNotes.delete(note);

        // Visual feedback
        const keyElement = document.querySelector(`[data-note="${note}"]`);
        if (keyElement) keyElement.classList.remove('active');
    }

    stop() {
        if (!this.isPlaying && !this.isRecording) return;
        
        if (this.isRecording) {
            this.stopRecording();
        }
        
        if (this.isPlaying) {
            this.isPlaying = false;
            this.element.classList.remove('playing');
            this.element.querySelector('.play-btn').innerHTML = '<span class="icon">▶</span> Play';
            
            // Clear all timeouts
            this.playbackTimeouts.forEach(timeout => clearTimeout(timeout));
            this.playbackTimeouts = [];
            
            // Stop all playing notes
            if (this.playingNotes) {
                this.playingNotes.forEach((noteData, note) => {
                    this.stopNote(note);
                });
            }
        }
        
        console.log(`Stopped ${this.label}`);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// Initialize the keyboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const keyboard = new ElectricKeyboard();
});

