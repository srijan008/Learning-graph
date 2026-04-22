import json
import re

def fix_latex_corruption(text):
    if not isinstance(text, str): return text
    # Replace common escaped-as-control-character patterns
    # \f -> \frac
    text = text.replace('\x0c', r'\f') # ASCII 12 (form feed)
    # \t -> \text or \theta or \tau
    # If we see a TAB (\t) followed by 'ext', it was almost certainly \text
    text = text.replace('\text', r'\t' + 'ext') # Already handled if it literalized
    # Standard control chars that often corrupt LaTeX
    repls = {
        '\x0c': r'\f', # form feed
        '\x08': r'\b', # backspace (e.g. \beta)
        '\x07': r'\a', # bell (e.g. \alpha)
        '\x0b': r'\v', # vertical tab
        '\t': r'\t',   # TAB (\t) -> \t (for \text, \theta, etc)
    }
    for k, v in repls.items():
        text = text.replace(k, v)
    return text

with open('neet_examside_data_mapped_v6.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for q in data:
    q['question'] = fix_latex_corruption(q.get('question', ''))
    q['explanation'] = fix_latex_corruption(q.get('explanation', ''))
    if q.get('options'):
        for opt in q['options']:
            opt['text'] = fix_latex_corruption(opt.get('text', ''))

with open('neet_examside_data_mapped_v6.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print('Data fixed.')

