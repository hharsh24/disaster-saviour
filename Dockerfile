# Use official Python image
FROM python:3.9

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies required by Ultralytics/OpenCV
RUN apt-get update && apt-get install -y libgl1-mesa-glx libglib2.0-0

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all the application files into the container
COPY . .

# Expose port (Render uses $PORT env variable)
EXPOSE 10000

# Start the FastAPI server — Render injects $PORT automatically
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
