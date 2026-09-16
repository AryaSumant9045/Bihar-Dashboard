import re

with open('pages/war-room.html', 'r') as f:
    content = f.read()

# 1. Extract Top 3 Requiring Attention
top_attention_match = re.search(r'<!-- Executive priority scan -->.*?</section>', content, flags=re.DOTALL)
if top_attention_match:
    top_attention_html = top_attention_match.group(0)
    # Remove it from its original place
    content = content.replace(top_attention_html, '')
else:
    print("Could not find Top Attention box")

# 2. Remove President Action Centre
action_centre_match = re.search(r'<!-- Presidential action centre -->.*?</section>', content, flags=re.DOTALL)
if action_centre_match:
    content = content.replace(action_centre_match.group(0), '')
else:
    print("Could not find Action Centre box")

# 3. Remove Per-Item Analysis Queue
per_item_match = re.search(r'<!-- Per-item Analysis Queue \(secondary, collapsed by default\) -->.*?</section>', content, flags=re.DOTALL)
if per_item_match:
    content = content.replace(per_item_match.group(0), '')
else:
    print("Could not find Per-item queue box")

# 4. Insert Top 3 Requiring Attention immediately after Intelligence Summary
intel_summary_match = re.search(r'<!-- ═══════════════════════════════════════════════════════════.*?</section>', content, flags=re.DOTALL)
if intel_summary_match and top_attention_match:
    intel_html = intel_summary_match.group(0)
    # We want to place Top Attention right after Intelligence Summary
    replacement = intel_html + '\n\n' + top_attention_html
    content = content.replace(intel_html, replacement)
else:
    print("Could not find Intelligence Summary box")

with open('pages/war-room.html', 'w') as f:
    f.write(content)
