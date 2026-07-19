import uvicorn
from main import app
import gradio as gr

# Create a dummy Gradio interface so Hugging Face is happy
demo = gr.Interface(
    fn=lambda: "Disaster Saviour Backend is Running!",
    inputs=None,
    outputs="text",
    title="Disaster Saviour API"
)

# Mount the Gradio app onto our existing FastAPI app at /gradio
app = gr.mount_gradio_app(app, demo, path="/gradio")

if __name__ == "__main__":
    # Hugging Face Spaces exposes port 7860
    uvicorn.run(app, host="0.0.0.0", port=7860)
