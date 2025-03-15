import streamlit as st
import pandas as pd
import qrcode
from PIL import Image, ImageDraw, ImageFont
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
import os
import logging
from io import BytesIO

# Make dotenv optional
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # If dotenv is not installed, just continue without it
    pass

# Page config
st.set_page_config(
    page_title="QR Code Generator",
    page_icon="🎫",
    layout="centered"
)

def generate_qr_code(registration_number):
    """Generate a QR code with a label for the given registration number."""
    try:
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(registration_number)
        qr.make(fit=True)
        
        # Create QR code image
        qr_image = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to PIL Image
        qr_image = qr_image.get_image()
        
        # Create a new image with space for label
        label_height = 40
        new_img = Image.new('RGB', 
                          (qr_image.width, qr_image.height + label_height), 
                          'white')
        
        # Paste QR code
        new_img.paste(qr_image, (0, 0))
        
        # Add label
        draw = ImageDraw.Draw(new_img)
        try:
            font = ImageFont.truetype("arial.ttf", 20)
        except OSError:
            font = ImageFont.load_default()
            
        # Add registration number text
        text = f"Registration: {registration_number}"
        text_width = draw.textlength(text, font=font)
        text_position = ((new_img.width - text_width) // 2, qr_image.height + 10)
        draw.text(text_position, text, fill='black', font=font)
        
        return new_img
            
    except Exception as e:
        st.error(f"Error generating QR code: {str(e)}")
        return None

def main():
    st.title("QR Code Generator")
    
    # File uploader for CSV
    uploaded_file = st.file_uploader("Upload registration CSV", type=['csv'])
    
    if uploaded_file:
        df = pd.read_csv(uploaded_file)
        
        # Display data preview
        st.subheader("Data Preview")
        st.dataframe(df.head())
        
        # Generate QR codes
        if st.button("Generate QR Codes"):
            for idx, row in df.iterrows():
                reg_number = str(row['Reg. No.'])
                qr_image = generate_qr_code(reg_number)
                
                if qr_image:
                    # Convert to bytes for download
                    buf = BytesIO()
                    qr_image.save(buf, format='PNG')
                    
                    # Create download button
                    st.download_button(
                        label=f"Download QR for {reg_number}",
                        data=buf.getvalue(),
                        file_name=f"qr_{reg_number}.png",
                        mime="image/png"
                    )

if __name__ == "__main__":
    main() 