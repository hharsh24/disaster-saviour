from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import io

def get_exif_data(image):
    """Extract EXIF data from PIL Image."""
    exif_data = {}
    info = image._getexif()
    if info:
        for tag, value in info.items():
            decoded = TAGS.get(tag, tag)
            if decoded == "GPSInfo":
                gps_data = {}
                for t in value:
                    sub_decoded = GPSTAGS.get(t, t)
                    gps_data[sub_decoded] = value[t]
                exif_data[decoded] = gps_data
            else:
                exif_data[decoded] = value
    return exif_data

def convert_to_degrees(value):
    """Convert the GPS coordinates stored in the EXIF to degress in float format."""
    d, m, s = value
    return float(d) + (float(m) / 60.0) + (float(s) / 3600.0)

def extract_gps_from_bytes(image_bytes: bytes):
    """Returns (lat, long) from image bytes, or (None, None) if not found."""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        exif = get_exif_data(image)
        if "GPSInfo" in exif:
            gps_info = exif["GPSInfo"]
            
            # Extract Latitude
            lat_data = gps_info.get("GPSLatitude")
            lat_ref = gps_info.get("GPSLatitudeRef")
            
            # Extract Longitude
            lon_data = gps_info.get("GPSLongitude")
            lon_ref = gps_info.get("GPSLongitudeRef")
            
            if lat_data and lat_ref and lon_data and lon_ref:
                lat = convert_to_degrees(lat_data)
                if lat_ref != "N":
                    lat = -lat
                    
                lon = convert_to_degrees(lon_data)
                if lon_ref != "E":
                    lon = -lon
                    
                return lat, lon
    except Exception as e:
        print(f"Error extracting GPS: {e}")
        pass
        
    return None, None
