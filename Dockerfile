# Use official Python image
FROM python:3.9

# Set the working directory inside the container
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .

# Install system dependencies required by Ultralytics/OpenCV
RUN apt-get update && apt-get install -y libgl1-mesa-glx libglib2.0-0

# Install Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy all the application files into the container
COPY . .

# Create a non-root user (Recommended by Hugging Face)
RUN useradd -m -u 1000 user
USER user

# Hugging Face Spaces expose port 7860 by default
EXPOSE 7860

# Start the FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
