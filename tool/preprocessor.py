import cv2
import numpy as np
import json

SOURCE = "source.mp4"
DESTINATION = "data.bin"
WIDTH = 48
HEIGHT = 36
BLOCK_SIZE = 10

def classify_block(block):
    total_white = np.count_nonzero(block == 255)
    
    if total_white <= 3:
        return 0
    if total_white >= 97:
        return 7
    
    M = cv2.moments(block)
    if M["m00"] == 0:
        return 0
        
    cx = M["m10"] / M["m00"]
    
    ratio = total_white / 100.0
    
    if ratio < 0.25:
        return 1 if cx < 4.5 else 2
    elif ratio < 0.45:
        return 3 if cx < 4.5 else 4
    elif ratio < 0.75:
        return 3 if cx < 4.5 else 4
    elif ratio < 0.90:
        return 6 if cx < 4.5 else 5
    else:
        return 6 if cx < 4.5 else 5

def preprocess(path):
    cap = cv2.VideoCapture(path)
    binary_data = bytearray()
    frame_count = 0
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        _, threshold = cv2.threshold(grey, 127, 255, cv2.THRESH_BINARY)
        
        frame_pixels = []
        for y in range(HEIGHT):
            for x in range(WIDTH):
                block = threshold[y * BLOCK_SIZE : (y + 1) * BLOCK_SIZE, x * BLOCK_SIZE : (x + 1) * BLOCK_SIZE]
                char_index = classify_block(block)
                frame_pixels.append(char_index)
        
        rle_bytes = pack_compressed(frame_pixels)
        
        num_pairs = len(rle_bytes) // 2
        binary_data.extend(num_pairs.to_bytes(2, byteorder='big'))
        binary_data.extend(rle_bytes)
        frame_count += 1
        
    cap.release()
    
    with open(DESTINATION, "wb") as f:
        f.write(binary_data)
    print(f"Processed {frame_count} frames successfully.")
    
def pack_compressed(pixels):
    nibbles = []
    for i in range(0, len(pixels), 2):
        high = pixels[i]
        low = pixels[i + 1] if i + 1 < len(pixels) else 0
        nibbles.append((high << 4) | low)
        
    if not nibbles:
        return bytearray()
    
    rle_bytes = bytearray()
    current_byte = nibbles[0]
    count = 1
    
    for b in nibbles[1:]:
        if b == current_byte and count < 255:
            count += 1
        else:
            rle_bytes.append(count)
            rle_bytes.append(current_byte)
            current_byte = b
            count = 1
    rle_bytes.append(count)
    rle_bytes.append(current_byte)
    return rle_bytes

if __name__ == "__main__":
    preprocess(SOURCE)