import lzma, shutil
with lzma.open(r'C:\Users\z4fwa\AppData\Local\Temp\frida-gadget.so.xz', 'rb') as f_in:
    with open(r'C:\Users\z4fwa\OneDrive\Pictures\Documents\trading-dashboard\libfrida-gadget.so', 'wb') as f_out:
        shutil.copyfileobj(f_in, f_out)
print('extracted')
