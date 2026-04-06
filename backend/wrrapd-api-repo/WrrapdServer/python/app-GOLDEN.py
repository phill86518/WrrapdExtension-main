from openai import OpenAI
import time
import requests
from PIL import Image  # For viewing images
from io import BytesIO
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_openai_key = os.environ.get("OPENAI_API_KEY")
if not _openai_key:
    raise RuntimeError(
        "OPENAI_API_KEY is not set. Add it to the .env file in the WrrapdServer directory."
    )
client = OpenAI(api_key=_openai_key)

# Create images directory if it doesn't exist
IMAGES_DIR = "generated_patterns"
os.makedirs(IMAGES_DIR, exist_ok=True)

# Function to generate gift-wrap design images
def generate_gift_wrap_images(pattern_description):
    refined_prompt = (
        f"Create a seamless, repeating pattern for gift-wrapping paper based on this description: {pattern_description}. "
        f"Make it perfectly tileable for wrapping paper. No text, no symbols, no gift boxes."
    )
    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=refined_prompt,
            n=1,
            size="1024x1024",
            quality="standard"
        )
        url = response.data[0].url

        # Download and save image
        img_response = requests.get(url)
        if img_response.status_code == 200:
            img = Image.open(BytesIO(img_response.content))
            img_path = os.path.join(IMAGES_DIR, f"gift_wrap_design_{time.time()}.png")
            img.save(img_path)
            print(f"Design saved as {img_path}")
            return img_path
        else:
            print("Failed to download image.")
            return None
    except Exception as e:
        print(f"An error occurred: {e}")
        return None

# Function to generate gift-wrap design ideas (text-based) using GPT-4
def generate_gift_wrap_design(prompt):
    try:
        system_prompt = """You are a creative assistant specializing in generating gift wrap patterns.
        Generate 3 different pattern ideas. Each pattern should be a repeating, seamless design.
        Format your response as 3 separate paragraphs, one for each pattern.
        Focus on describing patterns, textures, and abstract elements - avoid mentioning objects, text, or gift boxes.
        Be specific about colors, shapes, and arrangements."""
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            # max_tokens=300
        )
        return response.choices[0].message.content.strip().split('\n\n')
    except Exception as e:
        return [f"An error occurred: {e}"]

# Interactive flow
def gift_wrap_suggestion():
    greeting = "Howdy! Would you like us to suggest a gift-wrap design?"
    print(greeting)
    user_response = input("Enter Y or N: ").strip().lower()
    
    if user_response in ['n', 'no']:
        print("Alright, we can help with something else later!")
        return
    
    if user_response in ['y', 'yes']:
        print('Do share who the gift is for and the occasion (e.g., "25th Wedding Anniversary for my parents"):')
        user_prompt = input("Enter details: ").strip()

        print("\nGenerating design suggestions...")

        # Generate text ideas
        pattern_descriptions = generate_gift_wrap_design(user_prompt)
        
        # Generate and save images based on each description
        design_images = []
        for i, description in enumerate(pattern_descriptions, 1):
            print(f"\nPattern {i}:")
            print(description.strip())
            print("\nGenerating image for this pattern...")
            img_path = generate_gift_wrap_images(description)
            if img_path:
                design_images.append(img_path)
            time.sleep(2)  # Small delay between generations

        print("\nHere are your designs:")
        for i, img_path in enumerate(design_images, 1):
            print(f"Design {i}: {img_path}")

if __name__ == "__main__":
    gift_wrap_suggestion()