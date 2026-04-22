import json
import re

def comprehensive_latex_fix(text):
    if not isinstance(text, str): return text
    
    # 1. Direct ASCII control char replacements
    # These are characters that usually replace the backslash + letter
    # \f (ASCII 12) often replaces \f in \frac
    text = text.replace('\x0c', r'\f')
    # \b (ASCII 8) often replaces \b in \beta or \begin
    text = text.replace('\x08', r'\b')
    # \a (ASCII 7) often replaces \a in \alpha
    text = text.replace('\x07', r'\a')
    # \v (ASCII 11) often replaces \v in \vec
    text = text.replace('\x0b', r'\v')
    
    # 2. Contextual replacements for Tab (\t), Newline (\n), and Returns (\r)
    # These are trickier as they might be legitimate formatting, but in LaTeX
    # they are often corrupted forms of \text, \tau, \theta, \right, \left, \nu, \eta, etc.
    
    # Check for Tab + specific starts
    text = text.replace('\text', r'\t' + 'ext') # Literal \text is fine
    # If we catch a literal Tab character (ASCII 9)
    text = text.replace('\t', r'\t')
    
    # Check for Newline + specific starts
    # \n (ASCII 10) followed by 'eft' -> \left
    text = text.replace('\neft', r'\n' + 'eft') # Wait, this is ambiguous
    # Better: just convert all \n, \r to their escaped versions IF they are inside math delimiters or look suspicious
    # For now, let's just do a blanket replacement of \n to literal \n string if it looks like it's part of a command
    text = text.replace('\n', r'\n')
    text = text.replace('\r', r'\r')
    
    return text

with open('neet_examside_data_mapped_v6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for q in data:
    q['question'] = comprehensive_latex_fix(q.get('question', ''))
    q['explanation'] = comprehensive_latex_fix(q.get('explanation', ''))
    q['solution'] = comprehensive_latex_fix(q.get('solution', ''))
    if q.get('options'):
        for opt in q['options']:
            if isinstance(opt, dict):
                opt['text'] = comprehensive_latex_fix(opt.get('text', ''))
            elif isinstance(opt, str):
                # Handle case where options might be a list of strings
                pass

with open('neet_examside_data_mapped_v6.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print('Final LaTeX fix complete.')

