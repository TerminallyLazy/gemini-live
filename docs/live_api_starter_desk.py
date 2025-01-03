import asyncio
import base64
import io
import sys
import traceback
import logging
from dotenv import load_dotenv
import os
from datetime import datetime

import pyaudio
import PIL.Image
import PIL.ImageGrab

from google import genai

# Set up logging
def setup_logging():
    """Setup logging configuration with both file and console output"""
    # Create logs directory if it doesn't exist
    logs_dir = "logs"
    if not os.path.exists(logs_dir):
        os.makedirs(logs_dir)

    # Create timestamp for filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_filename = os.path.join(logs_dir, f"gemini_desk_{timestamp}.log")

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            # File handler with timestamp filename
            logging.FileHandler(log_filename),
            # # Console handler
            # logging.StreamHandler()
        ]
    )

    logger = logging.getLogger(__name__)
    # Print just this one message to console so user knows where logs are going
    print(f"Logging to file: {log_filename}")
    logger.info(f"Logging started - Log file: {log_filename}")
    return logger

if sys.version_info < (3, 11, 0):
    import taskgroup, exceptiongroup
    asyncio.TaskGroup = taskgroup.TaskGroup
    asyncio.ExceptionGroup = exceptiongroup.ExceptionGroup

# Configure Gemini API Key
# Load environment variables from the .env file
load_dotenv()
# Access the API key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

FORMAT = pyaudio.paInt16
CHANNELS = 1
SEND_SAMPLE_RATE = 16000
RECEIVE_SAMPLE_RATE = 24000
CHUNK_SIZE = 512

MODEL = "models/gemini-2.0-flash-exp"

client = genai.Client(
    http_options={'api_version': 'v1alpha'},
    api_key=GEMINI_API_KEY
    )

CONFIG={
    "generation_config": {"response_modalities": ["AUDIO"]}}

pya = pyaudio.PyAudio()


class AudioLoop:
    def __init__(self):
        self.audio_in_queue = asyncio.Queue()
        self.audio_out_queue = asyncio.Queue()
        self.video_out_queue = asyncio.Queue()
        self.session = None
        self.send_text_task = None
        self.receive_audio_task = None
        self.play_audio_task = None
        logger.info("AudioLoop initialized with screen capture")

    async def send_text(self):
        while True:
            text = await asyncio.to_thread(input, "message > ")
            if text.lower() == "q":
                break
            await self.session.send(text or ".", end_of_turn=True)

    def _get_screen_frame(self):
        """Capture and process a single screen frame using PIL"""
        try:
            # Capture the screen using PIL
            screenshot = PIL.ImageGrab.grab()
            logger.debug(f"Screenshot captured - Size: {screenshot.size}")

            # Resize to stay within Gemini's limits
            original_size = screenshot.size
            screenshot.thumbnail([1024, 1024])
            logger.debug(f"Image resized from {original_size} to {screenshot.size}")

            # Convert to JPEG
            image_io = io.BytesIO()
            screenshot.save(image_io, format="jpeg", quality=80)
            image_io.seek(0)

            # Prepare frame data
            mime_type = "image/jpeg"
            image_bytes = image_io.read()
            encoded_size = len(image_bytes)
            logger.debug(f"Image encoded - Size: {encoded_size} bytes")
            
            return {
                "mime_type": mime_type,
                "data": base64.b64encode(image_bytes).decode()
            }

        except Exception as e:
            logger.error(f"Error in _get_screen_frame: {str(e)}")
            logger.error(traceback.format_exc())
            return None

    async def get_frames(self):
        """Capture frames asynchronously"""
        try:
            logger.info("Starting screen capture...")
            frame_count = 0

            while True:
                try:
                    frame = await asyncio.to_thread(self._get_screen_frame)
                    if frame is None:
                        logger.error("Screen capture failed")
                        await asyncio.sleep(1.0)  # Wait before retry
                        continue

                    frame_count += 1
                    if frame_count % 10 == 0:  # Log every 10th frame
                        logger.debug(f"Captured screen frame {frame_count}")

                    self.video_out_queue.put_nowait(frame)
                    logger.debug(f"Frame {frame_count} added to queue")

                except Exception as e:
                    logger.error(f"Error in frame capture loop: {str(e)}")
                    logger.error(traceback.format_exc())

                await asyncio.sleep(1.0)  # Capture rate: 1 frame per second

        except Exception as e:
            logger.error(f"Error in get_frames: {str(e)}")
            logger.error(traceback.format_exc())

    async def send_frames(self):
        """Send frames to the Gemini session"""
        frame_count = 0
        try:
            while True:
                frame = await self.video_out_queue.get()
                frame_count += 1
                logger.debug(f"Sending frame {frame_count} to session")
                
                try:
                    await self.session.send(frame)
                    logger.debug(f"Frame {frame_count} sent successfully")
                except Exception as e:
                    logger.error(f"Error sending frame {frame_count}: {str(e)}")
        except Exception as e:
            logger.error(f"Error in send_frames: {str(e)}")
            logger.error(traceback.format_exc())

    # [Previous audio-related methods remain unchanged]
    async def listen_audio(self):
        logger.info("Starting audio listening...")
        try:
            pya = pyaudio.PyAudio()
            mic_info = pya.get_default_input_device_info()
            logger.debug(f"Using microphone: {mic_info['name']}")
            
            stream = await asyncio.to_thread(
                pya.open,
                format=FORMAT,
                channels=CHANNELS,
                rate=SEND_SAMPLE_RATE,
                input=True,
                input_device_index=mic_info["index"],
                frames_per_buffer=CHUNK_SIZE,
            )
            logger.info("Audio stream opened successfully")
            
            while True:
                data = await asyncio.to_thread(stream.read, CHUNK_SIZE)
                self.audio_out_queue.put_nowait(data)
        except Exception as e:
            logger.error(f"Error in listen_audio: {str(e)}")
            logger.error(traceback.format_exc())

    async def send_audio(self):
        try:
            chunk_count = 0
            while True:
                chunk = await self.audio_out_queue.get()
                chunk_count += 1
                if chunk_count % 100 == 0:  # Log every 100th chunk
                    logger.debug(f"Sending audio chunk {chunk_count}")
                await self.session.send({"data": chunk, "mime_type": "audio/pcm"})
        except Exception as e:
            logger.error(f"Error in send_audio: {str(e)}")
            logger.error(traceback.format_exc())

    async def receive_audio(self):
        try:
            while True:
                async for response in self.session.receive():
                    server_content = response.server_content
                    if server_content is not None:
                        model_turn = server_content.model_turn
                        if model_turn is not None:
                            parts = model_turn.parts

                            for part in parts:
                                if part.text is not None:
                                    print(part.text, end="")
                                elif part.inline_data is not None:
                                    self.audio_in_queue.put_nowait(part.inline_data.data)

                        server_content.model_turn = None
                        turn_complete = server_content.turn_complete
                        if turn_complete:
                            logger.debug("Turn complete received")
                            while not self.audio_in_queue.empty():
                                self.audio_in_queue.get_nowait()
        except Exception as e:
            logger.error(f"Error in receive_audio: {str(e)}")
            logger.error(traceback.format_exc())

    async def play_audio(self):
        try:
            logger.info("Starting audio playback...")
            pya = pyaudio.PyAudio()
            stream = await asyncio.to_thread(
                pya.open, format=FORMAT, channels=CHANNELS, rate=RECEIVE_SAMPLE_RATE, output=True
            )
            logger.info("Audio playback stream opened successfully")
            
            while True:
                bytestream = await self.audio_in_queue.get()
                await asyncio.to_thread(stream.write, bytestream)
        except Exception as e:
            logger.error(f"Error in play_audio: {str(e)}")
            logger.error(traceback.format_exc())

    async def run(self):
        logger.info("Starting AudioLoop.run()")
        try:
            async with (
                client.aio.live.connect(model=MODEL, config=CONFIG) as session,
                asyncio.TaskGroup() as tg,
            ):
                self.session = session
                logger.info("Session connected successfully")

                send_text_task = tg.create_task(self.send_text())

                def cleanup(task):
                    logger.info("Cleaning up tasks...")
                    for t in tg._tasks:
                        t.cancel()
                    logger.info("Tasks cleanup complete")

                send_text_task.add_done_callback(cleanup)

                # Create all tasks
                tasks = [
                    tg.create_task(self.listen_audio()),
                    tg.create_task(self.send_audio()),
                    tg.create_task(self.get_frames()),
                    tg.create_task(self.send_frames()),
                    tg.create_task(self.receive_audio()),
                    tg.create_task(self.play_audio())
                ]

                def check_error(task):
                    if task.cancelled():
                        logger.debug(f"Task {task.get_name()} was cancelled")
                        return

                    if task.exception() is not None:
                        e = task.exception()
                        logger.error(f"Task {task.get_name()} failed with exception:")
                        logger.error(traceback.format_exception(None, e, e.__traceback__))
                        sys.exit(1)

                for task in tg._tasks:
                    task.add_done_callback(check_error)

        except Exception as e:
            logger.error(f"Error in run: {str(e)}")
            logger.error(traceback.format_exc())

if __name__ == "__main__":
    logger = setup_logging()
    logger.info("Starting application...")
    print("Application started, type 'q' to exit the app.")
    try:
        main = AudioLoop()
        asyncio.run(main.run())
    except KeyboardInterrupt:
        logger.info("Application stopped by user")
    except Exception as e:
        logger.error(f"Application error: {str(e)}")
        logger.error(traceback.format_exc())