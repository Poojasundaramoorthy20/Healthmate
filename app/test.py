"""
Quick setup tester for Health Assistant App
Run this to check if everything is configured correctly
"""

import os
from pathlib import Path

def test_setup():
    print("\n" + "="*60)
    print("🔍 HEALTH ASSISTANT SETUP CHECKER")
    print("="*60 + "\n")
    
    issues = []
    
    # Check 1: .env file
    print("1. Checking .env file...")
    if Path('.env').exists():
        print("   ✓ .env file found")
        
        # Try to load it
        from dotenv import load_dotenv
        load_dotenv()
        
        # Check API keys
        gemini_key = os.environ.get("GEMINI_API_KEY")
        places_key = os.environ.get("GOOGLE_PLACES_API_KEY")
        
        if gemini_key:
            print(f"   ✓ GEMINI_API_KEY found ({len(gemini_key)} characters)")
        else:
            print("   ✗ GEMINI_API_KEY not found in .env")
            issues.append("Add GEMINI_API_KEY to .env file")
        
        if places_key:
            print(f"   ✓ GOOGLE_PLACES_API_KEY found ({len(places_key)} characters)")
        else:
            print("   ✗ GOOGLE_PLACES_API_KEY not found in .env")
            issues.append("Add GOOGLE_PLACES_API_KEY to .env file")
    else:
        print("   ✗ .env file not found")
        issues.append("Create .env file with your API keys")
    
    # Check 2: Templates folder
    print("\n2. Checking templates folder...")
    templates_dir = Path('templates')
    if templates_dir.exists():
        print("   ✓ templates folder found")
        
        required_files = ['base.html', 'index.html', 'chatbot.html', 
                         'reminders.html', 'hospitals.html']
        
        for file in required_files:
            file_path = templates_dir / file
            if file_path.exists():
                print(f"   ✓ {file} found")
            else:
                print(f"   ✗ {file} missing")
                issues.append(f"Create templates/{file}")
    else:
        print("   ✗ templates folder not found")
        issues.append("Create templates folder")
    
    # Check 3: Required packages
    print("\n3. Checking required packages...")
    required_packages = {
        'flask': 'Flask',
        'google.generativeai': 'google-generativeai',
        'requests': 'requests',
        'dotenv': 'python-dotenv'
    }
    
    for module, package in required_packages.items():
        try:
            __import__(module)
            print(f"   ✓ {package} installed")
        except ImportError:
            print(f"   ✗ {package} not installed")
            issues.append(f"Install {package}: pip install {package}")
    
    # Check 4: Test Gemini API
    print("\n4. Testing Gemini API connection...")
    try:
        from dotenv import load_dotenv
        import google.generativeai as genai
        load_dotenv()
        
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-pro')
            
            # Try a simple test
            response = model.generate_content("Say 'Hello'")
            print(f"   ✓ Gemini API working! Response: {response.text[:50]}...")
        else:
            print("   ✗ Cannot test - API key not found")
    except Exception as e:
        print(f"   ✗ Gemini API test failed: {str(e)}")
        issues.append("Check your GEMINI_API_KEY is valid")
    
    # Summary
    print("\n" + "="*60)
    if issues:
        print("❌ ISSUES FOUND:")
        print("="*60)
        for i, issue in enumerate(issues, 1):
            print(f"{i}. {issue}")
        print("\n💡 Fix these issues and run the test again")
    else:
        print("✅ ALL CHECKS PASSED!")
        print("="*60)
        print("\n🚀 Your setup is complete! Run: python app.py")
    print("="*60 + "\n")

if __name__ == "__main__":
    test_setup()