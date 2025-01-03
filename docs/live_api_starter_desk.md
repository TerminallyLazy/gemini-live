# Gemini Live API Desktop Assistant

This application is a desktop assistant that combines audio input/output capabilities with screen capture functionality to interact with Google's Gemini API. It creates an interactive experience where users can communicate with the Gemini model through both voice and text while sharing their screen.

## Features

- Real-time audio input and output
- Screen capture and streaming
- Text-based chat interface
- Asynchronous processing
- Comprehensive logging system

## Technical Overview

### Main Components

#### AudioLoop Class
The primary class that manages all audio, video, and interaction functionality.

##### Key Attributes:
- `audio_in_queue`: AsyncIO queue for incoming audio
- `audio_out_queue`: AsyncIO queue for outgoing audio
- `video_out_queue`: AsyncIO queue for screen capture frames
- `session`: Manages the connection to Gemini API

##### Methods:

1. `__init__()`
   - Initializes queues and session variables
   - Sets up basic configuration for audio and video processing

2. `send_text()`
   - Handles text input from the user
   - Allows for text-based interaction with the model
   - Processes quit command ('q')

3. `_get_screen_frame()`
   - Captures screen using PIL
   - Processes and resizes image to meet Gemini API requirements
   - Converts image to JPEG format and base64 encodes it
   - Returns formatted frame data

4. `get_frames()`
   - Asynchronously captures screen frames
   - Manages frame capture rate (1 FPS)
   - Handles error logging and recovery

5. `send_frames()`
   - Sends captured frames to Gemini session
   - Manages frame queue and transmission
   - Handles error logging

6. `listen_audio()`
   - Initializes audio input stream
   - Captures microphone input
   - Processes audio chunks

7. `send_audio()`
   - Sends audio data to Gemini API
   - Manages audio transmission queue
   - Handles chunked audio data

8. `receive_audio()`
   - Processes responses from Gemini API
   - Handles both text and audio responses
   - Manages response queuing

9. `play_audio()`
   - Manages audio output stream
   - Plays received audio responses
   - Handles audio playback queue

10. `run()`
    - Main execution method
    - Creates and manages all async tasks
    - Handles session lifecycle and cleanup

### Utility Functions

#### setup_logging()
- Creates logging directory and timestamped log files
- Configures logging format and handlers
- Returns configured logger instance

### Technical Specifications

- Audio Format: 16-bit PCM
- Audio Channels: Mono (1 channel)
- Input Sample Rate: 16000 Hz
- Output Sample Rate: 24000 Hz
- Chunk Size: 512 bytes
- Screen Capture: 1 FPS
- Image Format: JPEG (quality: 80)
- Maximum Image Dimensions: 1024x1024

## Requirements

- Python 3.11+ (for native `asyncio.TaskGroup`)
- PyAudio
- PIL (Python Imaging Library)
- Google Generative AI Python SDK
- Base64
- AsyncIO

## Configuration

The application uses the following key configurations:

```python
FORMAT = pyaudio.paInt16
CHANNELS = 1
SEND_SAMPLE_RATE = 16000
RECEIVE_SAMPLE_RATE = 24000
CHUNK_SIZE = 512
MODEL = "models/gemini-2.0-flash-exp"
```

## Error Handling

- Comprehensive error logging
- Task-specific error callbacks
- Graceful cleanup on failure
- Automatic retry mechanisms

## Logging System

The application implements a robust logging system that:
- Creates timestamped log files
- Logs to both file and console
- Captures different log levels (DEBUG, INFO, ERROR)
- Provides detailed error tracebacks

## Usage

1. Set up your Gemini API key:
```python
GEMINI_API_KEY = 'your_api_key_here'
```

2. Run the application:
```bash
python live_api_starter_desk.py
```

3. Interact using:
   - Voice through your default microphone
   - Text by typing in the console
   - Type 'q' to quit

## Notes

- The application requires appropriate microphone permissions
- Screen capture may require additional permissions on some systems
- Memory usage should be monitored during extended sessions
- Network bandwidth usage can be significant due to continuous audio/video streaming