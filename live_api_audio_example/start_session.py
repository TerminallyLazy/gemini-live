import asyncio
from google import genai
from google.genai import types

client = genai.Client(api_key="YOUR_GEMINI_API_KEY")

async def main():
    # Configure for audio input & audio output (optional)
    config = types.GenerateContentConfig(
        generation_config={
            "response_modalities": ["AUDIO"],  # Model can respond with audio
            "audio_in_config": {               # Tells the model you’ll be sending audio
                "sample_rate_hz": 16000,
                "language_code": "en",         # Or your preferred language
            },
        }
    )

    # Start the live session
    async with client.aio.live.connect(
        model="gemini-2.0-flash-exp",
        config=config
    ) as session:

        print("Session started. Send or stream audio to the model...")

        # Example: you could stream the microphone in a background task:
        task = asyncio.create_task(audio_input_task(session))

        # Meanwhile, receive the model’s responses (audio or text):
        async for response in session.receive():
            if response.text:
                print("Model said (text):", response.text)
            if response.data:
                # This is PCM data from the model's audio response
                handle_incoming_audio(response.data)
            # or respond to function calls, etc.

        # Clean up if needed
        await task

asyncio.run(main()) 