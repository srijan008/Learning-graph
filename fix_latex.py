import json

def fix_latex(text: str) -> str:
    if not isinstance(text, str):
        return text
        
    replacements = {
        '\x0c': r'\f',      # form feed -> \f
        '\r': r'\r',        # carriage return -> \r
        '\x08': r'\b',      # backspace -> \b
        '\x0b': r'\v',      # vertical tab -> \v
        '\x07': r'\a',      # bell -> \a
    }
    for bad_char, good_char in replacements.items():
        text = text.replace(bad_char, good_char)
        
    # \t and \n are trickier since they might be valid whitespace,
    # but in math mode we safely replace known occurrences:
    text = text.replace('\the', r'\the')
    text = text.replace('\tim', r'\tim')
    text = text.replace('\tex', r'\tex')
    text = text.replace('\tan', r'\tan')
    text = text.replace('\tau', r'\tau')
    
    text = text.replace('\nab', r'\nab')
    text = text.replace('\nu', r'\nu')
    text = text.replace('\ne', r'\ne')
    text = text.replace('\no', r'\no')

    return text

def traverse_and_fix(data):
    if isinstance(data, dict):
        return {k: traverse_and_fix(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [traverse_and_fix(v) for v in data]
    elif isinstance(data, str):
        return fix_latex(data)
    return data

if __name__ == '__main__':
    with open('neet_examside_data_mapped_v6.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    fixed_data = traverse_and_fix(data)
    
    with open('neet_examside_data_mapped_v6.json', 'w', encoding='utf-8') as f:
        json.dump(fixed_data, f, ensure_ascii=False, indent=2)
    print("Fixed corrupted LaTeX.")
