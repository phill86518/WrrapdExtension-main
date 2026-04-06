from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
import time
import requests
from PIL import Image
from io import BytesIO
import os
from pathlib import Path
import json

# Load .env from WrrapdServer/ (parent of this python/ directory)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = Flask(__name__)
CORS(app)  # Enable CORS for Chrome extension

_openai_key = os.environ.get("OPENAI_API_KEY")
if not _openai_key:
    raise RuntimeError(
        "OPENAI_API_KEY is not set. Add it to the .env file in the WrrapdServer directory."
    )
client = OpenAI(api_key=_openai_key)

# Create images directory if it doesn't exist
IMAGES_DIR = "generated_patterns"
os.makedirs(IMAGES_DIR, exist_ok=True)

# Function to generate gift-wrap design images using DALL-E 3
def generate_gift_wrap_images(pattern_description):
    """
    Generates a gift-wrap design image using DALL-E 3 based on pattern description.
    Returns the image URL from DALL-E (temporary, expires after ~1 hour).
    """
    refined_prompt = (
        f"Create a seamless, repeating pattern for gift-wrapping paper based on this description: {pattern_description}. "
        f"Make it perfectly tileable for wrapping paper. No text, no symbols, no gift boxes."
    )
    
    try:
        print(f"[generate_gift_wrap_images] Generating image with prompt: {refined_prompt[:100]}...")
        response = client.images.generate(
            model="dall-e-3",
            prompt=refined_prompt,
            n=1,
            size="1024x1024",
            quality="standard"
        )
        
        image_url = response.data[0].url
        print(f"[generate_gift_wrap_images] Generated image URL: {image_url}")
        
        # Optional: Download and save image locally
        try:
            img_response = requests.get(image_url, timeout=30)
            if img_response.status_code == 200:
                img = Image.open(BytesIO(img_response.content))
                img_path = os.path.join(IMAGES_DIR, f"gift_wrap_design_{int(time.time())}_{hash(pattern_description) % 10000}.png")
                img.save(img_path)
                print(f"[generate_gift_wrap_images] Design saved locally as {img_path}")
        except Exception as save_error:
            print(f"[generate_gift_wrap_images] Warning: Could not save image locally: {save_error}")
        
        return image_url
        
    except Exception as e:
        print(f"[generate_gift_wrap_images] Error generating image: {e}")
        import traceback
        traceback.print_exc()
        return None

# Function to generate gift-wrap design ideas (text-based) using GPT-4o
def generate_gift_wrap_design(prompt):
    """
    Generates 3 gift-wrap design pattern descriptions using GPT-4o.
    Returns a list of 3 description strings.
    """
    try:
        system_prompt = """You are a creative assistant specializing in generating gift wrap patterns.
        Generate 3 different pattern ideas. Each pattern should be a repeating, seamless design.
        Format your response as 3 separate paragraphs, one for each pattern.
        Focus on describing patterns, textures, and abstract elements - avoid mentioning objects, text, or gift boxes.
        Be specific about colors, shapes, and arrangements.
        Each paragraph should be a complete, detailed description of one pattern."""
        
        print(f"[generate_gift_wrap_design] Generating designs for: {prompt}")
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=800
        )
        
        content = response.choices[0].message.content.strip()
        print(f"[generate_gift_wrap_design] Received response: {content[:200]}...")
        
        # Split by double newlines or create 3 separate designs
        descriptions = [d.strip() for d in content.split('\n\n') if d.strip()]
        
        # If we got fewer than 3, pad with variations
        while len(descriptions) < 3:
            descriptions.append(descriptions[-1] if descriptions else "A beautiful repeating pattern")
        
        # Take only first 3
        result = descriptions[:3]
        print(f"[generate_gift_wrap_design] Generated {len(result)} descriptions")
        return result
        
    except Exception as e:
        print(f"[generate_gift_wrap_design] Error generating design descriptions: {e}")
        import traceback
        traceback.print_exc()
        return [
            "An elegant geometric pattern with soft pastel colors",
            "A modern abstract design with bold colors and flowing lines",
            "A classic pattern with intricate details and rich colors"
        ]

@app.route('/generate-ideas', methods=['POST'])
def generate_ideas():
    """
    Main endpoint for generating gift-wrap design ideas.
    Expected request: {"occasion": "string"}
    Returns: JSON with designs array containing title, description, and imageUrl
    """
    try:
        # Get the occasion from request
        data = request.get_json()
        if not data:
            print("[generate-ideas] ERROR: No JSON data provided")
            return jsonify({"error": "No JSON data provided"}), 400
        
        occasion = data.get('occasion', '').strip()
        
        if not occasion:
            print("[generate-ideas] ERROR: Occasion is required")
            return jsonify({"error": "Occasion is required"}), 400
        
        print(f"[generate-ideas] Received occasion: {occasion}")
        
        # Generate text descriptions
        print("[generate-ideas] Generating design descriptions...")
        pattern_descriptions = generate_gift_wrap_design(occasion)
        
        if not pattern_descriptions or len(pattern_descriptions) == 0:
            print("[generate-ideas] ERROR: Failed to generate design descriptions")
            return jsonify({"error": "Failed to generate design descriptions"}), 500
        
        # Generate images and build response
        designs = []
        for i, description in enumerate(pattern_descriptions, 1):
            print(f"[generate-ideas] Processing design {i}/3...")
            print(f"[generate-ideas] Description: {description[:100]}...")
            
            # Generate image with timeout protection
            image_url = None
            try:
                print(f"[generate-ideas] Starting image generation for design {i}...")
                image_url = generate_gift_wrap_images(description)
                if image_url:
                    print(f"[generate-ideas] ✓ Design {i} image generated successfully: {image_url[:50]}...")
                else:
                    print(f"[generate-ideas] ✗ Design {i} image generation returned None")
            except Exception as img_error:
                print(f"[generate-ideas] ✗ Error generating image for design {i}: {img_error}")
                import traceback
                traceback.print_exc()
            
            # Create design object
            design = {
                "title": f"Design {i}",
                "description": description
            }
            
            # Add image URL if available
            if image_url:
                design["imageUrl"] = image_url
                print(f"[generate-ideas] Design {i} has imageUrl: {image_url}")
            else:
                print(f"[generate-ideas] WARNING: No image URL for design {i} - will show 'No image available'")
            
            designs.append(design)
            
            # Small delay between image generations to avoid rate limits
            if i < len(pattern_descriptions):
                print(f"[generate-ideas] Waiting 2 seconds before next image generation...")
                time.sleep(2)
        
        # Build response
        response_data = {
            "designs": designs
        }
        
        print(f"[generate-ideas] Successfully generated {len(designs)} designs")
        
        # Verify each design has the expected structure
        for i, design in enumerate(designs, 1):
            print(f"[generate-ideas] Design {i} structure: title={design.get('title')}, hasDescription={bool(design.get('description'))}, hasImageUrl={bool(design.get('imageUrl'))}, imageUrl={design.get('imageUrl', 'NONE')}")
        
        print(f"[generate-ideas] Final response data: {json.dumps(response_data, indent=2)}")
        
        # Return JSON response
        # The extension does JSON.parse(JSON.parse(rawData)), so we need to double-stringify
        response_str = json.dumps(json.dumps(response_data))
        print(f"[generate-ideas] Returning double-stringified JSON (length: {len(response_str)})")
        return response_str, 200, {'Content-Type': 'application/json'}
        
    except Exception as e:
        print(f"[generate-ideas] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to generate design ideas"}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy"}), 200

@app.route('/', methods=['GET'])
def index():
    """Root endpoint"""
    return jsonify({
        "message": "Wrrapd API Server",
        "endpoints": {
            "POST /generate-ideas": "Generate gift-wrap design ideas",
            "GET /health": "Health check"
        }
    }), 200

if __name__ == "__main__":
    # For development
    app.run(host='0.0.0.0', port=5000, debug=True)
    
    # For production, use a WSGI server like gunicorn:
    # gunicorn -w 4 -b 0.0.0.0:5000 app:app

