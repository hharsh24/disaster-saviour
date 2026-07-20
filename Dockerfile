# Use official Python image
FROM python:3.9

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies required by Ultralytics/OpenCV
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all the application files into the container
COPY . .

# Expose port (Hugging Face uses 7860, Render uses $PORT)
EXPOSE 7860

# Start the FastAPI server
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
