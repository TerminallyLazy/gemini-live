import pyaudio
import asyncio

async def audio_input_task(session):
    """
    Continuously read mic audio in short chunks and send them to the model.
    """
    p = pyaudio.PyAudio()
    chunk_size = 1024
    sample_rate = 16000
    channels = 1

    stream = p.open(
        format=pyaudio.paInt16,
        channels=channels,
        rate=sample_rate,
        input=True,
        frames_per_buffer=chunk_size
    )

    print("Recording from microphone... Press Ctrl+C to stop.")

    try:
        while True:
            audio_chunk = stream.read(chunk_size, exception_on_overflow=False)

            # Send partial audio data to the model
            await session.send_audio(
                audio_chunk,
                # signal end_of_turn=False here because we are continuing to speak
                end_of_turn=False,
            )

            # You may want to implement a pause-detection mechanism (VAD) or a user manual stop
            # to switch end_of_turn=True so the model can respond.

    except asyncio.CancelledError:
        # handle task cancellation if main session ends
        pass

    finally:
        # Tell the model you are done speaking (end_of_turn=True so the model can respond)
        await session.send_audio(b'', end_of_turn=True)

        stream.stop_stream()
        stream.close()
        p.terminate()
        print("Stopped recording mic audio.") 