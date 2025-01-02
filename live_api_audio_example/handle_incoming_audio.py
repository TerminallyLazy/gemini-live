import wave

audio_filename = "model_response.wav"

wf = wave.open(audio_filename, "ab")  # Append in "ab" mode to keep adding chunks

def handle_incoming_audio(audio_bytes: bytes):
    # Make sure your wave file is opened with the correct sample rate & format
    global wf
    wf.writeframes(audio_bytes) 