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

# Create images directory
IMAGES_DIR = "generated_patterns"
os.makedirs(IMAGES_DIR, exist_ok=True)

# Function to generate gift-wrap design images
def generate_gift_wrap_images(prompt, occasion):
    refined_prompt = (
        f"A seamless, repeating pattern for gift-wrapping paper. "
        f"Focus on a {occasion}-themed decorative design with abstract elements and textures. "
        f"No objects, no text, no words, no symbols, no images of gift boxes."
    )
    try:
        images = []
        for i in range(3):
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
                img_path = os.path.join(IMAGES_DIR, f"gift_wrap_design_{i+1}.png")
                img.save(img_path)
                images.append(img_path)
                print(f"Design {i+1} saved as {img_path}")
            else:
                print(f"Failed to download image {i+1}.")
            
            time.sleep(2)  # Small delay between generations
        
        return images
    except Exception as e:
        print(f"An error occurred: {e}")
        return []

# Function to generate gift-wrap design ideas (text-based) using GPT-4
def generate_gift_wrap_design(prompt):
    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a creative assistant specializing in generating gift wrap design ideas."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=150
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"An error occurred: {e}"

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

        # Extract the occasion from the user input
        occasion = "generic occasion"
        if "birthday" in user_prompt.lower():
            occasion = "birthday"
        elif "wedding" in user_prompt.lower():
            occasion = "wedding"
        elif "anniversary" in user_prompt.lower():
            occasion = "anniversary"
        elif "holiday" in user_prompt.lower():
            occasion = "holiday"

        print('What theme would you like? (say "None" for no suggestion)')
        theme = input("Enter theme or 'None': ").strip()
        if theme.lower() != "none":
            user_prompt += f", theme: {theme}"
        else:
            user_prompt += ", generic design"

        print("Generating design suggestions...")

        # Generate text ideas
        designs_text = generate_gift_wrap_design(user_prompt)
        print(f"\nGenerated Design Ideas (Text):\n{designs_text}\n")
        
        # Generate image suggestions
        print("Generating design images...")
        design_images = generate_gift_wrap_images(user_prompt, occasion)
        
        print("\nHere are your designs:")
        for i, img_path in enumerate(design_images, start=1):
            print(f"Design {i}: {img_path}")

if __name__ == "__main__":
    gift_wrap_suggestion()