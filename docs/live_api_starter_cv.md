# Live API Starter Documentation  

References:  
	https://github.com/google-gemini/cookbook/blob/main/gemini-2/README.md  
	https://github.com/google-gemini/cookbook/blob/main/gemini-2/live_api_starter.py  

The new Live API requires:  
	https://pypi.org/project/google-genai/  
	https://github.com/googleapis/python-genai  

This PyPI package doesn't support Live API:  
	https://pypi.org/project/google-generativeai/  
	https://github.com/google-gemini/generative-ai-python  

Notes as of 2024-12-13:  
	`google-generativeai` - old python sdk, for Gemini API in Google AI Studio only  
	`google-vertexai` - more complex, for Gemini LLM models in Google Vertex AI only  
	`google-genai` - new one sdk, for both VertexAI and Gemini API. Supports the Live API.  

## The NEW GenAI API:

The new Google Gen AI SDK provides a unified interface to Gemini 2.0 through both the Gemini Developer API and the Gemini Enterprise API ( Vertex AI).  
With a few exceptions, code that runs on one platform will run on both. The Gen AI SDK also supports the Gemini 1.5 models.

Python
The Google Gen AI SDK for Python is available on PyPI and GitHub:
	google-genai on PyPI   --> `pip install google-genai`
	python-genai on GitHub

To learn more, see the Python SDK reference:
	https://googleapis.github.io/python-genai/

Quickstart
1. Import libraries
	``` python
	from google import genai
	from google.genai import types
	```
2. Create a client
	``` python
	client = genai.Client(api_key='YOUR_API_KEY')
	```
3. Generate content
	``` python
	response = client.models.generate_content(
		model='gemini-2.0-flash-exp', contents='What is your name?'
	)
	print(response.text)
	```
	
## Overview
The Live API Starter is a Python application that implements real-time audio and video interaction with Google's Gemini AI model. It creates a bidirectional communication channel where users can send text, audio, and video input while receiving audio and text responses from the model in real-time.

## Key Features
- Real-time audio input/output processing
- Video capture and streaming
- Text-based interaction
- Asynchronous operation
- Bidirectional communication with Gemini AI model

## Class Documentation

### AudioLoop
Main class that manages the audio/video streaming pipeline and communication with the Gemini AI model.

## Method Documentation

### AudioLoop.__init__
Initializes queues for audio/video processing and sets up session management.

### AudioLoop.send_text
Handles text input from the user and sends it to the Gemini session.

### AudioLoop._get_frame
Captures and processes a single video frame, converting it to JPEG format with size constraints.

### AudioLoop.get_frames
Continuously captures video frames from the default camera and adds them to the video queue.

### AudioLoop.send_frames
Sends captured video frames to the Gemini session.

### AudioLoop.listen_audio
Sets up and manages audio input stream from the microphone.

### AudioLoop.send_audio
Sends audio chunks from the output queue to the Gemini session.

### AudioLoop.receive_audio
Processes responses from the Gemini model, handling both text and audio data.

### AudioLoop.play_audio
Manages audio playback of responses received from the model.

### AudioLoop.run
Main execution method that coordinates all the async tasks and manages the session lifecycle.

## Global Constants

- FORMAT: Set to pyaudio.paInt16 for audio format
- CHANNELS: Set to 1 for mono audio
- SEND_SAMPLE_RATE: 16000Hz for input audio
- RECEIVE_SAMPLE_RATE: 24000Hz for output audio
- CHUNK_SIZE: 512 bytes for audio processing
- MODEL: Uses "models/gemini-2.0-flash-exp" for AI interactions

## Technical Details
- Uses asyncio for concurrent operations
- Implements PyAudio for audio handling
- Uses OpenCV (cv2) for video capture
- Integrates with Google's Genai client
- Supports Python 3.11+ with fallback for earlier versions