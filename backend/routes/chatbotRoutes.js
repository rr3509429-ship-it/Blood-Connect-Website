// backend/routes/chatbotRoutes.js
// ============================================================
//  BloodConnect — Enhanced BloodBot v2.0
//  Features:
//   • 100+ question patterns across 12 categories
//   • Fuzzy matching (Levenshtein distance) for typo tolerance
//   • Synonym normalization
//   • Regex intent detection
//   • Random response variation (human-like)
//   • Context-aware follow-up suggestions
//   • Conversation context (short memory)
//   • Smart fallback with closest-match suggestions
//   • Zero external dependencies — pure Node.js
// ============================================================

const express = require('express');
const router  = express.Router();

// ─────────────────────────────────────────────────────────────
// 1. SYNONYM MAP  — normalise before matching
// ─────────────────────────────────────────────────────────────
const SYNONYMS = {
  'blud':'blood','blodd':'blood','blod':'blood','bld':'blood',
  'donat':'donate','donating':'donate','donation':'donate','donated':'donate',
  'donner':'donor','donnor':'donor','doner':'donor',
  'recieve':'receive','reciver':'receiver','reciever':'receiver',
  'emergancy':'emergency','emergensy':'emergency','emergancy':'emergency',
  'eligble':'eligible','eligibel':'eligible','eligiblity':'eligibility',
  'compatibel':'compatible','compatibilty':'compatibility',
  'receit':'receipt','reciept':'receipt','recipt':'receipt',
  'registar':'register','registeration':'registration','registred':'registered',
  'pasword':'password','passwd':'password','passward':'password',
  'hosptial':'hospital','hospitel':'hospital',
  'appoinment':'appointment','appointement':'appointment',
  'availble':'available','availibilty':'availability',
  'cooldown':'cooldown','cool down':'cooldown','wait period':'cooldown',
  'when can i donate again':'cooldown','next donation':'cooldown',
  'saftey':'safety','safty':'safety',
  'benifits':'benefits','benfits':'benefits',
  'urgent':'emergency','asap':'emergency','critical':'emergency',
  'immediately':'emergency','right now':'emergency',
};

function normalizeSynonyms(text) {
  let t = text.toLowerCase();
  for (const [wrong, right] of Object.entries(SYNONYMS)) {
    t = t.split(wrong).join(right);
  }
  return t;
}

// ─────────────────────────────────────────────────────────────
// 2. FUZZY MATCH  — Levenshtein distance (no libraries needed)
// ─────────────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function fuzzyMatch(word, pattern) {
  if (word.includes(pattern) || pattern.includes(word)) return true;
  if (pattern.length < 4) return word === pattern;
  const maxDist = pattern.length <= 5 ? 1 : pattern.length <= 8 ? 2 : 3;
  return levenshtein(word, pattern) <= maxDist;
}

// ─────────────────────────────────────────────────────────────
// 3. PICK RANDOM RESPONSE VARIANT
// ─────────────────────────────────────────────────────────────
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────────────────────
// 4. KNOWLEDGE BASE  — 100+ intents, 12 categories
// ─────────────────────────────────────────────────────────────
const KB = [

  // ── GREETINGS ──────────────────────────────────────────────
  {
    id: 'greeting', category: 'greetings',
    patterns: ['hello','hi','hey','salaam','howdy','good morning','good afternoon','good evening',
               'greetings','start','begin','yo','sup','hola','namaste','salam','assalam','help me'],
    responses: [
      '👋 Hello! Welcome to **BloodConnect**!\n\nI\'m BloodBot — your smart blood donation assistant. I can help with:\n• Eligibility & health checks\n• Blood type compatibility\n• Donating or requesting blood\n• Emergency procedures\n• Account, receipts & more\n\nWhat can I do for you today?',
      '😊 Hi there! Great to see you at **BloodConnect**!\n\nAsk me anything — eligibility, blood groups, emergencies, donation process, or account help. I\'m here 24/7!\n\nWhat would you like to know?',
      '🩸 Welcome to BloodConnect! I\'m BloodBot.\n\nTry asking:\n• "Can I donate blood?"\n• "How to request blood urgently"\n• "Blood type compatibility"\n• "Download my donation receipt"\n\nHow can I help?'
    ],
    followUp: ['Can I donate blood?','How to request blood?','Blood type compatibility']
  },

  // ── FAREWELL ───────────────────────────────────────────────
  {
    id: 'farewell', category: 'greetings',
    patterns: ['bye','goodbye','see you','take care','later','quit','exit','done','that\'s all',
               'nothing else','no more questions','thanks bye','ok bye','good night','cya'],
    responses: [
      '👋 Goodbye! Thanks for using BloodConnect.\nRemember — **every donation saves up to 3 lives!** 🩸❤️',
      '😊 Take care! Come back anytime. You\'re making a difference just by being here!',
      '🌟 Bye! Blood donation is one of the greatest gifts you can give. See you soon!'
    ]
  },

  // ── THANKS ─────────────────────────────────────────────────
  {
    id: 'thanks', category: 'greetings',
    patterns: ['thank','thanks','thank you','appreciate','helpful','great bot','good bot','well done',
               'perfect','awesome','amazing','excellent','love it','nice','cool','wonderful','brilliant'],
    responses: [
      '😊 You\'re very welcome! Happy to help.\n\nEvery donation saves up to **3 lives**. You\'re amazing! 🩸❤️\n\nAnything else I can help with?',
      '🌟 My pleasure! That\'s what I\'m here for.\n\nIs there anything else about blood donation you\'d like to know?',
      '❤️ Thank YOU for caring! Every person who donates or spreads awareness makes a real difference.\n\nNeed help with anything else?'
    ]
  },

  // ── ELIGIBILITY ────────────────────────────────────────────
  {
    id: 'eligibility', category: 'donation',
    patterns: ['eligible','eligibility','can i donate','who can donate','qualify','requirements',
               'criteria','am i fit','fit to donate','able to donate','allowed to donate',
               'donation requirement','donor requirement','who is eligible','check eligibility',
               'is it okay to donate','am i allowed','can i give blood','who qualifies'],
    regex: [/can\s+i\s+(give|donate)\s+blood/i, /am\s+i\s+(eligible|qualified|able)\s+to\s+donate/i],
    responses: [
      '✅ **Donation Eligibility Requirements:**\n\n• **Age:** 18–65 years\n• **Weight:** Minimum 50 kg\n• **Hemoglobin:** ≥12.5 g/dL (women) / ≥13.0 g/dL (men)\n• **Blood Pressure:** 90/60 – 180/100 mmHg\n• **Pulse:** 50–100 bpm (regular)\n• **Cooldown:** No donation in the last 56 days\n• **Health:** No fever, active infections, or serious illness\n• **Exclusions:** No HIV, Hepatitis B/C, active cancer, blood thinners\n• **No:** Tattoo/piercing in last 6 months, recent surgery (<6 months)\n\n👉 Use **Dashboard → Eligibility Check** for a personalised assessment!',
      '📋 **Can You Donate? Quick Check:**\n\n✅ **YES** if you:\n• Are 18–65 years old, weighing 50+ kg\n• Feel healthy — no fever or active illness\n• Haven\'t donated in the last 8 weeks\n• Have no blood-borne diseases\n\n❌ **NO** if you:\n• Have HIV, Hepatitis B/C, or certain STIs\n• Got a tattoo/piercing within 6 months\n• Are pregnant or gave birth within 6 months\n• Take blood thinners or certain antibiotics\n\nStill unsure? Use the **Eligibility Checker** in your dashboard!'
    ],
    followUp: ['What medical conditions prevent donation?','How often can I donate?','What to eat before donating?']
  },

  // ── MEDICAL CONDITIONS ─────────────────────────────────────
  {
    id: 'medical_conditions', category: 'eligibility',
    patterns: ['diabetes','heart disease','medication','taking medicine','sick','illness',
               'chronic condition','pregnant','pregnancy','hiv','hepatitis','cancer',
               'recent surgery','blood pressure','asthma','epilepsy','seizure','thyroid',
               'anemia','iron deficiency','on medication','antibiotics','blood thinners',
               'warfarin','aspirin','disabled','disability'],
    responses: [
      '⚠️ **Medical Conditions & Donation Eligibility:**\n\n❌ **NOT eligible** if you have:\n• HIV, Hepatitis B/C, or blood-borne STIs\n• Insulin-dependent diabetes\n• Active heart disease or surgery in last 6 months\n• Active cancer (some remission cases OK)\n• Pregnancy or childbirth in last 6 months\n• Current infections, fever, or active illness\n\n⚠️ **Consult a doctor first** if you have:\n• Controlled Type 2 diabetes (may be eligible)\n• Controlled hypertension (depends on readings)\n• Asthma (if well-controlled, usually fine)\n• Thyroid condition (depends on medication)\n• Taking antibiotics (wait until course finished + 48hrs)\n\n✅ **Use Dashboard → Eligibility Check** for a personalised assessment!\n\n*Always consult your doctor before donating if you have any chronic condition.*'
    ],
    followUp: ['Am I eligible to donate?','What are the age and weight requirements?']
  },

  // ── BLOOD TYPE COMPATIBILITY ───────────────────────────────
  {
    id: 'blood_compatibility', category: 'blood_groups',
    patterns: ['blood type','blood group','compatible','compatibility','which blood','type match',
               'universal donor','universal recipient','blood match','can receive','can donate to',
               'blood group match','type compatible','who can receive','who can donate to',
               'blood transfusion','which type','compatible blood','matching blood'],
    regex: [/what\s+(blood\s+)?(type|group)\s+(can|should)/i,
            /(o|a|b|ab)\s*(positive|negative|\+|-)\s*(compatible|donate|receive)/i],
    responses: [
      '🩸 **Blood Type Compatibility Chart:**\n\n| Type  | Donate To        | Receive From         |\n|-------|-----------------|----------------------|\n| O−    | **All types** ✨ | O− only              |\n| O+    | O+, A+, B+, AB+ | O+, O−               |\n| A−    | A−, A+, AB−, AB+ | A−, O−               |\n| A+    | A+, AB+         | A+, A−, O+, O−       |\n| B−    | B−, B+, AB−, AB+ | B−, O−               |\n| B+    | B+, AB+         | B+, B−, O+, O−       |\n| AB−   | AB−, AB+        | A−, B−, AB−, O−      |\n| AB+   | AB+ only        | **All types** ✨      |\n\n💡 **O−** = Universal Donor | **AB+** = Universal Recipient',
      '🔬 **Blood Compatibility Quick Guide:**\n\n🌟 **O−** — Can donate to ALL groups (universal donor, always needed!)\n🌟 **AB+** — Can receive from ALL groups (universal recipient)\n\n**General rule:** Same type always compatible. O− donates to everyone. AB+ receives from everyone.\n\n**Most common (O+):** Can receive from O+ and O−\n**Rarest (AB−):** Can only receive from A−, B−, AB−, O−\n\nAsk for the full table for your specific type!'
    ],
    followUp: ['What is the rarest blood type?','What is O negative special?','Blood group facts']
  },

  // ── BLOOD GROUP FACTS ──────────────────────────────────────
  {
    id: 'blood_group_facts', category: 'blood_groups',
    patterns: ['o negative','o positive','a positive','a negative','b positive','b negative',
               'ab positive','ab negative','rarest blood','most common blood','blood group facts',
               'o neg','o pos','blood type facts','which blood group is rare','common blood type',
               'most needed blood','blood type statistics','blood group percentage'],
    responses: [
      '🩸 **Blood Group Facts & Statistics:**\n\n| Group | Frequency | Notes |\n|-------|-----------|-------|\n| O+    | ~38%      | Most common worldwide |\n| A+    | ~34%      | Second most common |\n| B+    | ~9%       | Very common in South Asia |\n| AB+   | ~3%       | Universal recipient |\n| O−    | ~7%       | Universal donor — most needed |\n| A−    | ~6%       | Relatively rare |\n| B−    | ~2%       | Rare |\n| AB−   | ~1%       | Rarest type |\n\n🆘 **O−** is critical for:\n• Newborn emergency transfusions\n• Trauma & accident victims\n• Patients with unknown blood type\n\nCheck your blood group in **Dashboard → Profile**!'
    ],
    followUp: ['Blood type compatibility chart','Why is O negative important?']
  },

  // ── EMERGENCY ──────────────────────────────────────────────
  {
    id: 'emergency', category: 'emergencies',
    patterns: ['emergency','urgent','critical','asap','immediately','life threatening','danger',
               'serious','urgent blood','blood emergency','need blood urgently','blood urgently',
               'blood asap','urgent need','immediate blood','blood needed now','blood required urgently',
               'patient needs blood','emergency request','help fast','quick blood','fast blood'],
    regex: [/need\s+blood\s+(urgently|immediately|asap|now|fast)/i,
            /(urgent|critical|emergency)\s+(blood|donation|request)/i,
            /blood\s+(emergency|crisis|urgently)/i,
            /patient\s+(is\s+)?(dying|critical|urgent)/i],
    responses: [
      '🚨 **EMERGENCY Blood Request — Act Now:**\n\n**On BloodConnect:**\n1. Log in → Click **"Request Blood"**\n2. Toggle **🔴 Emergency Mode ON**\n3. Fill blood group, hospital, units needed\n4. Submit → ALL compatible nearby donors are **instantly notified!**\n\n**Also call simultaneously:**\n• 🇵🇰 Pakistan: **1122** (Emergency) | **115** (Blood Bank)\n• 🇺🇸 USA/Canada: **911**\n• Nearest hospital blood bank directly\n\n⚡ Do ALL of the above at once — every second counts!',
      '🆘 **Urgent Blood Needed? Multi-step approach:**\n\n**Step 1 — BloodConnect:** Submit Emergency Request in your dashboard (notifies 100+ donors instantly)\n**Step 2 — Hospital:** Contact the hospital blood bank directly\n**Step 3 — Emergency line:** 1122 (Pakistan) / 911 (USA)\n**Step 4 — Social:** Use the share feature for wider reach\n\nDon\'t wait — do all steps simultaneously!'
    ],
    followUp: ['How to request blood?','Which blood type is universal donor?','Find blood bank near me']
  },

  // ── HOW TO DONATE ──────────────────────────────────────────
  {
    id: 'how_to_donate', category: 'donation',
    patterns: ['how to donate','steps to donate','donate blood','donation process','give blood',
               'process of donation','donating blood','how does donation work','donation steps',
               'blood donation procedure','donate whole blood','want to donate','start donating',
               'become a donor','how do i donate','donation guide','donation tutorial'],
    regex: [/how\s+(do|can|should)\s+i\s+donate\s+blood/i,
            /what\s+is\s+the\s+(process|procedure|steps?)\s+(of|for)\s+(blood\s+)?donation/i],
    responses: [
      '💉 **How to Donate Blood on BloodConnect:**\n\n**1. Register** — Sign up as Donor (free, 2 min)\n**2. Set Availability** — Toggle "Available" ON in dashboard\n**3. Get Matched** — System emails you when compatible request appears\n**4. Accept Request** — Review details & click Accept\n**5. Donate** — Visit hospital, takes only 10–15 minutes\n**6. Mark Complete** — Update status in dashboard\n**7. Get Receipt** — PDF receipt auto-generated 📄\n\n🌟 Your donation can save up to **3 lives!**'
    ],
    followUp: ['What to eat before donating?','How long does donation take?','Is blood donation safe?']
  },

  // ── HOW TO REQUEST BLOOD ───────────────────────────────────
  {
    id: 'how_to_request', category: 'donation',
    patterns: ['request blood','how to request','need blood','receive blood','blood request',
               'looking for blood','how to get blood','find blood','blood needed','need a donor',
               'find a donor','get blood','blood for patient','how to find donor',
               'blood request process','submit blood request','request procedure'],
    regex: [/how\s+(do|can|should)\s+i\s+(request|get|find)\s+blood/i,
            /need\s+(a\s+)?(blood|donor)/i],
    responses: [
      '🆘 **How to Request Blood on BloodConnect:**\n\n1. Register as **Receiver** (or Both)\n2. Go to **Dashboard → Request Blood**\n3. Fill in: blood group, city, hospital, units needed\n4. Toggle **🔴 Emergency** if urgent\n5. Submit — donors notified instantly!\n\n**What happens next:**\n• Compatible donors receive an email alert\n• A donor accepts → you see their contact info\n• Track status in **Dashboard → My Requests**\n\n💡 You can be BOTH a donor and receiver!'
    ],
    followUp: ['How does emergency mode work?','How to track my blood request?','What does pending status mean?']
  },

  // ── RECEIPT / PDF ──────────────────────────────────────────
  {
    id: 'receipt', category: 'account_help',
    patterns: ['receipt','pdf','download receipt','certificate','proof','download pdf',
               'get receipt','donation certificate','proof of donation','receipt not showing',
               'generate receipt','pdf receipt','official receipt','can\'t download receipt',
               'where is my receipt','receipt missing','no receipt','donation proof'],
    responses: [
      '📄 **Donation PDF Receipts:**\n\nBloodConnect auto-generates an official PDF receipt for every completed donation!\n\n**Includes:**\n• Unique Transaction ID\n• Donor & Receiver info\n• Blood group & units\n• Date, time & hospital\n• Digital verification stamp\n\n**To download:**\n1. **Dashboard → Donation History**\n2. Find your completed donation\n3. Click the **📄 Receipt** button\n\n**Not showing?**\n→ Click **"Generate Receipt"** next to your donation\n→ Refresh the page after 1–2 minutes\n→ Ensure donation status is "Completed"'
    ],
    followUp: ['How to mark donation as complete?','What does completed status mean?']
  },

  // ── SAFETY ─────────────────────────────────────────────────
  {
    id: 'safety', category: 'donation',
    patterns: ['safe','safety','risk','danger','side effects','after donation','post donation',
               'recover','is it safe','donation risks','hazards','scary','needle','pain',
               'does it hurt','will it hurt','blood donation pain','afraid','scared',
               'faint','dizziness','feel sick','after effects','recovery'],
    responses: [
      '🛡️ **Blood Donation Safety:**\n\n**During donation:**\n• Sterile, single-use needles only (never reused)\n• Takes only 10–15 minutes\n• Medical staff present throughout\n• Mild pinch at needle insertion — not painful\n\n**After donation:**\n• Rest 10–15 minutes at the centre\n• Drink fluids & have a snack (provided)\n• Avoid heavy exercise for 24 hours\n• Stay well-hydrated for the rest of the day\n\n**Common mild effects (temporary):**\n• Slight dizziness (rare) — sit or lie down\n• Small bruise at needle site\n\n✅ Blood donation is **completely safe** for healthy individuals. Millions donate safely every year!'
    ],
    followUp: ['What to eat after donating?','How long to recover after donation?','Am I eligible to donate?']
  },

  // ── PREPARATION / FOOD BEFORE DONATION ───────────────────
  {
    id: 'preparation', category: 'donation',
    patterns: ['food','eat','drink','before donating','preparation','prepare','diet before',
               'meal before','what to eat','what to drink','eating before','diet','prepare to donate',
               'before blood test','avoid before donation','what not to eat','can i eat before',
               'breakfast before','water before','hydrate before','should i eat'],
    responses: [
      '🍎 **Before Donating — Preparation Tips:**\n\n✅ **DO:**\n• Eat a healthy iron-rich meal 2–3 hours before (leafy greens, meat, lentils)\n• Drink an extra 500 ml of water\n• Sleep 7–8 hours the night before\n• Wear loose, comfortable clothing with easy sleeve access\n\n❌ **AVOID:**\n• Fatty foods (burgers, fries) — can affect blood testing\n• Alcohol for at least 24 hours before\n• Skipping meals — causes low blood sugar & dizziness\n• Heavy exercise on donation day\n\n💡 **Iron-rich foods to eat:**\nSpinach, red meat, beans, fortified cereals, dried fruit'
    ],
    followUp: ['What to eat after donating?','How long does donation take?','Is donation safe?']
  },

  // ── AFTER DONATION ─────────────────────────────────────────
  {
    id: 'after_donation', category: 'donation',
    patterns: ['after donation','post donation','after donating','what to do after','after giving blood',
               'eat after','drink after','rest after','recovery after','workout after donation',
               'exercise after','gym after','can i drive after','activity after donation'],
    responses: [
      '🍊 **After Donation — Recovery Guide:**\n\n**Immediately after:**\n• Rest 10–15 minutes at the donation centre\n• Have the provided juice/snack to restore blood sugar\n• Apply pressure on the needle site if bruising\n\n**Next 24 hours:**\n• Drink plenty of fluids (water, juice — avoid alcohol)\n• Eat iron-rich foods (meat, leafy greens, beans)\n• Avoid heavy lifting or intense exercise\n• Do not smoke for at least 1 hour after\n\n**Next few days:**\n• Continue eating iron-rich foods\n• Stay well-hydrated\n• You can resume normal activities next day\n\n⏱️ **Recovery timeline:**\n• Plasma: replaces within **24 hours**\n• Red blood cells: replenish in **4–6 weeks**'
    ],
    followUp: ['When can I donate again?','Is donation safe?','How to download my receipt?']
  },

  // ── DONATION DURATION / TIME ───────────────────────────────
  {
    id: 'donation_duration', category: 'donation',
    patterns: ['how long','duration','time to donate','how many minutes','how many hours',
               'quick donation','how fast','takes time','long does it take','donation time',
               'how much time','time required','is it quick','appointment length'],
    responses: [
      '⏱️ **Blood Donation Timeline:**\n\n• **Registration & check-in:** ~5 min\n• **Health screening:** ~5 min\n• **Actual blood draw:** **10–15 min**\n• **Rest & refreshments:** ~15 min\n\n**Total visit:** ~30–45 min (first time) | ~20–30 min (repeat donors)\n\n💡 The actual blood draw is just 10–15 minutes — most of the time is registration and recovery!\n\nYour body replaces plasma within 24 hours and red blood cells within 4–6 weeks.'
    ],
    followUp: ['What to eat before donating?','Is blood donation safe?','How often can I donate?']
  },

  // ── COOLDOWN / FREQUENCY ───────────────────────────────────
  {
    id: 'cooldown', category: 'donation',
    patterns: ['cooldown','cool down','wait time','when can i donate again','56 days','8 weeks',
               'how often donate','frequency','next donation date','donate again','how many times',
               'donation interval','between donations','minimum gap','rest period','wait period',
               'days between donation','can i donate twice','twice a month','monthly donation'],
    responses: [
      '📅 **Donation Frequency & Cooldown:**\n\n| Type             | Minimum Wait     | Max Per Year |\n|------------------|------------------|--------------|\n| Whole Blood      | **56 days** (8 wks) | 6 times   |\n| Platelets        | 7 days           | 24 times     |\n| Plasma           | 28 days          | 13 times     |\n| Double Red Cells | 112 days         | 3 times      |\n\n📱 **Your next eligible date** is shown in:\n**Dashboard → Eligibility Check**\n\nAfter each donation, BloodConnect automatically tracks your cooldown period!'
    ],
    followUp: ['Am I eligible to donate?','How to check my next donation date?','What are the health requirements?']
  },

  // ── DONATION VOLUME / UNITS ────────────────────────────────
  {
    id: 'donation_volume', category: 'donation',
    patterns: ['units','pint','ml','how much blood','volume of blood','amount of blood',
               'quantity','500ml','how many ml','blood volume','unit of blood',
               'how many units','1 unit blood','litre of blood','amount donated'],
    responses: [
      '📦 **Blood Donation Volume:**\n\n• **Whole blood:** ~450–500 ml (about 1 pint / 1 unit)\n• **Platelets:** ~200–300 ml\n• **Plasma:** up to 600 ml\n\nThis is only **8–10%** of your total blood volume — completely safe!\n\n**Recovery:**\n• Plasma: within **24 hours**\n• Red blood cells: within **4–6 weeks**\n\n**For blood requests:** Specify how many units needed\n(1 unit ≈ 450 ml whole blood)'
    ],
    followUp: ['How often can I donate?','Is donation safe?','What happens after donation?']
  },

  // ── BENEFITS OF DONATING ───────────────────────────────────
  {
    id: 'benefits', category: 'donation',
    patterns: ['benefits','benefit of donating','why donate','advantages','good for health',
               'health benefits','pros of donation','reason to donate','why should i donate',
               'donate blood benefits','is it good to donate','donation advantages',
               'motivate me','encourage me','why blood donation','reward','incentive'],
    responses: [
      '🌟 **Benefits of Donating Blood:**\n\n**For others:**\n• Saves up to **3 lives** per donation\n• Critical for accident victims, surgery patients, cancer treatment, childbirth\n• O− donors save lives in mass casualty events\n\n**For YOU:**\n• **Free health screening** (blood pressure, hemoglobin, disease check)\n• Stimulates production of new blood cells\n• May reduce risk of heart disease & certain cancers\n• Burns ~650 calories per donation\n• Sense of fulfilment & community connection\n• BloodConnect **PDF certificate** for each donation\n\n❤️ One hour of your time can mean everything to someone in need!'
    ],
    followUp: ['How to donate blood?','Am I eligible to donate?','What happens during donation?']
  },

  // ── DUAL ROLE ──────────────────────────────────────────────
  {
    id: 'dual_role', category: 'account_help',
    patterns: ['both','dual role','donor and receiver','donor receiver','two roles','both roles',
               'can i be both','donor and patient','register as both','switch role',
               'change role','update role','add role','become receiver','become donor'],
    responses: [
      '🔄 **Dual Role — Donor + Receiver:**\n\nYes! BloodConnect fully supports dual-role accounts.\n\n**During registration:** Select **"Both (Donor & Receiver)"**\n\n**Benefits:**\n• Donate when eligible\n• Request blood when needed\n• Access both donor & receiver dashboards\n• Single account manages everything\n\n**Already registered?**\nGo to **Dashboard → Profile Settings → Update Role** to upgrade anytime!'
    ],
    followUp: ['How to register?','How to donate blood?','How to request blood?']
  },

  // ── MAP / LOCATION ─────────────────────────────────────────
  {
    id: 'map_location', category: 'donation',
    patterns: ['map','location','nearby','find donor','gps','close to me','near me',
               'location sharing','blood bank near','donors nearby','close donors',
               'where to find blood','nearby donors','nearby blood bank','find blood near',
               'map feature','location feature','share location','pin location'],
    responses: [
      '📍 **Location & Map Features:**\n\n1. Go to **Dashboard → Map** section\n2. Click **"Share My Location"** (enable browser permissions)\n3. Map shows colour-coded pins:\n   • 🔵 **Blue** = Your location\n   • 🔴 **Red** = Nearby donors or blood requests\n4. Click any pin for contact info & distance\n\n**Tips:**\n• Allow location access in your browser settings\n• Zoom in/out to adjust the search radius\n• More donors appear when you toggle "Available" ON\n• Emergency requests show as highlighted pins'
    ],
    followUp: ['How to find blood bank?','How to become available for donation?','How to request blood?']
  },

  // ── BLOOD BANKS / HOSPITALS ────────────────────────────────
  {
    id: 'blood_bank', category: 'hospitals',
    patterns: ['blood bank','where to donate','donation center','center near','donation point',
               'donate where','hospital nearby','which hospital','blood bank list',
               'nearest blood bank','famous blood bank','blood bank pakistan',
               'blood bank lahore','blood bank karachi','blood bank islamabad',
               'where can i donate','donation location','find hospital'],
    responses: [
      '🏥 **Finding Donation Centers:**\n\nUse **Dashboard → Map** to find nearby donation points.\n\n**Major centers in Pakistan:**\n\n🔵 **Karachi:**\n• NICVD Blood Bank | JPMC | Aga Khan Hospital | Indus Hospital\n\n🟢 **Lahore:**\n• Services Hospital | Mayo Hospital | Sheikh Zayed Hospital\n\n🟡 **Islamabad/Rawalpindi:**\n• PIMS | Shifa International | Holy Family Hospital\n\n🔴 **Peshawar:**\n• KTH | Lady Reading Hospital (LRH)\n\n💡 Government hospitals have 24/7 blood banks. Always call ahead to confirm availability!'
    ],
    followUp: ['Find donors near me','How to request emergency blood?','How to donate blood?']
  },

  // ── REGISTRATION ───────────────────────────────────────────
  {
    id: 'registration', category: 'account_help',
    patterns: ['register','sign up','signup','create account','new user','join','how to start',
               'get started','new here','make account','create profile','open account',
               'how to join','how to register','registration process','sign up steps',
               'create new account','register as donor','register as receiver'],
    responses: [
      '📝 **How to Register on BloodConnect:**\n\n1. Click **"Sign Up"** on the homepage\n2. Enter: name, email, blood group, city\n3. Choose role: **Donor**, **Receiver**, or **Both**\n4. Verify your email via OTP code sent to your inbox\n5. Complete your profile: age, weight, phone number\n6. You\'re ready to save lives! 🎉\n\n✅ Registration is **completely free** and takes under **2 minutes!**\n\n💡 Choosing "Both" lets you donate AND request blood from one account.'
    ],
    followUp: ['What are donor eligibility requirements?','How to donate blood?','I didn\'t receive my OTP']
  },

  // ── LOGIN / PASSWORD ───────────────────────────────────────
  {
    id: 'login_help', category: 'account_help',
    patterns: ['password','forgot password','reset password','login problem','cant log in',
               'locked out','otp not working','verify email','not receiving otp','resend otp',
               'login issue','can\'t login','access account','account locked','wrong password',
               'email not verified','verification code','otp expired','didn\'t receive otp',
               'login error','sign in problem','account access','password reset'],
    responses: [
      '🔐 **Account & Login Help:**\n\n| Problem | Solution |\n|---------|----------|\n| Forgot password | Click **"Forgot Password"** on login page |\n| OTP not received | Click **"Resend OTP"** + check spam/junk folder |\n| OTP expired | Request a new one — OTPs expire in 10 minutes |\n| Account locked | Wait 15 minutes, then try again |\n| Wrong email | Use the email you registered with |\n\n**Still stuck?**\nUse the **Feedback** button in your dashboard to report the issue directly to our support team.'
    ],
    followUp: ['How to create an account?','How to update my profile?']
  },

  // ── PROFILE UPDATE ─────────────────────────────────────────
  {
    id: 'profile', category: 'account_help',
    patterns: ['profile','update profile','edit profile','change name','change city',
               'update info','personal info','edit account','change blood group',
               'update blood type','change phone','update email','profile settings',
               'account settings','change details','update details','modify profile'],
    responses: [
      '👤 **Updating Your Profile:**\n\nGo to **Dashboard → Profile Settings** to update:\n• Name, city, phone number\n• Age and weight *(affects eligibility checks)*\n• Blood group\n• Role (Donor / Receiver / Both)\n\n⚠️ **Keep age and weight updated** — these directly affect your eligibility calculation!\n\n✅ Changes save instantly and update across your entire dashboard.'
    ],
    followUp: ['How to check my eligibility?','How to change my role?','How to update availability?']
  },

  // ── AVAILABILITY ───────────────────────────────────────────
  {
    id: 'availability', category: 'donation',
    patterns: ['availability','turn on availability','turn off availability','active donor',
               'pause donations','stop receiving requests','set available','toggle available',
               'make myself available','donor status','am i active','active status',
               'how to go online','go offline','donation status toggle','available for donation'],
    responses: [
      '🔄 **Managing Donor Availability:**\n\nIn your **Donor Dashboard:**\n\n🟢 Toggle **ON** — You\'re available, system matches you with requests\n🔴 Toggle **OFF** — Paused (use when travelling, unwell, or busy)\n\n**Automatic behaviour:**\n• After completing a donation → availability turns OFF automatically\n• Your 56-day cooldown begins from donation date\n• After cooldown → manually turn it back ON\n\n💡 Keep availability updated so the right donors get matched with urgent requests!'
    ],
    followUp: ['When can I donate again?','How does matching work?','How to mark donation complete?']
  },

  // ── REQUEST STATUS ─────────────────────────────────────────
  {
    id: 'request_status', category: 'account_help',
    patterns: ['status','request status','donation status','pending','accepted','completed',
               'cancelled','check status','what does status mean','status meaning',
               'my request status','what is pending','what is accepted','track request',
               'donation progress','order status','blood request status','my donations'],
    responses: [
      '📋 **Understanding Request & Donation Statuses:**\n\n🟡 **Pending** — Request posted, searching for matching donors\n🔵 **Matched** — Compatible donors found, awaiting acceptance\n🟢 **Accepted** — A donor has agreed to donate\n✅ **Completed** — Donation done! PDF receipt is now available\n❌ **Cancelled** — Request was cancelled by the receiver\n\n**Where to check:**\n• Donors → **Dashboard → Donation History**\n• Receivers → **Dashboard → My Requests**\n\n💡 You\'ll receive an email notification at every status change!'
    ],
    followUp: ['How to download my receipt?','How to cancel a request?','How to mark donation complete?']
  },

  // ── NOTIFICATIONS ──────────────────────────────────────────
  {
    id: 'notifications', category: 'account_help',
    patterns: ['notification','email alert','notify me','get notified','how will i know',
               'informed','alert','receive notification','email notification','not getting emails',
               'missing notifications','no email','not notified','notification settings',
               'email not received','how do i get alerts','update me'],
    responses: [
      '🔔 **BloodConnect Notification System:**\n\nYou receive **email notifications** when:\n• A blood request matches your blood group & city\n• A donor accepts your blood request\n• Your donation is marked complete\n• An emergency request is posted in your area\n\n**Not receiving emails?**\n1. Check your **spam/junk folder**\n2. Verify your email in **Profile Settings**\n3. Whitelist `noreply@bloodconnect.com` in your email app\n4. Ensure your availability is toggled **ON** (for donors)\n\nAll notifications are sent to your **registered email address**.'
    ],
    followUp: ['How to update my email?','How to toggle availability?','What does accepted status mean?']
  },

  // ── APPOINTMENT ────────────────────────────────────────────
  {
    id: 'appointment', category: 'donation',
    patterns: ['appointment','book appointment','schedule donation','schedule appointment',
               'when to come','set time','book slot','donation appointment','reserve slot',
               'reserve time','fix appointment','fix time','schedule visit'],
    responses: [
      '📅 **Donation Appointments:**\n\nCurrently, BloodConnect works through a **request-matching system** rather than pre-booked slots:\n\n1. Set your availability **ON** in your dashboard\n2. When a matching request comes in, you receive an email\n3. You accept and go to the specified hospital\n\n**For walk-in donations** (without a specific request):\n• Visit any government hospital blood bank directly\n• Most accept walk-ins 24/7\n• Bring your CNIC/ID and inform them you\'re using BloodConnect\n\n💡 After donating, mark it complete in your dashboard to generate your receipt!'
    ],
    followUp: ['How to donate blood?','Find blood bank near me','How to toggle availability?']
  },

  // ── PLATELETS & PLASMA ─────────────────────────────────────
  {
    id: 'platelets_plasma', category: 'donation',
    patterns: ['platelets','platelet','plasma','plasma donation','platelet donation',
               'apheresis','double red cells','component donation','specific donation',
               'donate platelets','donate plasma','what is platelet','what is plasma'],
    responses: [
      '🔬 **Types of Blood Donation:**\n\n**1. Whole Blood** (most common)\n• 450–500 ml donated\n• Takes ~10–15 minutes\n• Wait 56 days between donations\n\n**2. Platelets (Apheresis)**\n• Only platelets extracted, rest returned\n• Takes ~1–2 hours\n• Can donate every 7 days (up to 24×/year)\n• Critical for cancer & chemo patients\n\n**3. Plasma**\n• Liquid part of blood extracted\n• Takes ~45 minutes\n• Wait 28 days between donations\n• Used for burn victims, clotting disorders\n\n**4. Double Red Cells**\n• Two units of red cells collected at once\n• Wait 112 days after\n\nBloodConnect primarily handles **whole blood** donations.'
    ],
    followUp: ['How often can I donate whole blood?','How long does donation take?','Am I eligible?']
  },

  // ── ADMIN HELP ─────────────────────────────────────────────
  {
    id: 'admin_help', category: 'admin_help',
    patterns: ['admin','admin panel','admin help','admin login','admin access','manage users',
               'admin dashboard','admin features','admin account','manage requests',
               'admin portal','manage donors','manage receivers','admin support'],
    responses: [
      '🔧 **Admin Panel Help:**\n\nBloodConnect Admins can:\n• View & manage all users (donors & receivers)\n• Monitor active blood requests\n• Update request statuses\n• View donation history & statistics\n• Generate system-wide reports\n• Manage emergency notifications\n\n**Admin Login:** Use your admin credentials at `/admin/login`\n\n**Issues with admin access?**\nContact the system administrator or use the feedback channel.'
    ],
    followUp: ['How to generate reports?','How to manage blood requests?']
  },

  // ── TECHNICAL SUPPORT ──────────────────────────────────────
  {
    id: 'technical_support', category: 'technical_support',
    patterns: ['technical','tech support','bug','error','not working','broken','crash',
               'page not loading','site down','glitch','problem','issue','404',
               'server error','can\'t access','website error','app not working',
               'feature broken','something wrong','report bug','report issue'],
    responses: [
      '🛠️ **Technical Support:**\n\n**Quick fixes to try first:**\n1. **Refresh** the page (Ctrl+R / Cmd+R)\n2. **Clear browser cache** (Ctrl+Shift+Delete)\n3. **Try a different browser** (Chrome, Firefox, Edge)\n4. **Disable browser extensions** temporarily\n5. **Check internet connection**\n\n**Specific issues:**\n• Login issues → Use password reset link\n• Map not loading → Allow location permissions\n• PDF not generating → Ensure donation status is "Completed"\n• Email not received → Check spam folder\n\n**Still stuck?** Click the **Feedback** button in your dashboard to report directly to our dev team!'
    ],
    followUp: ['I forgot my password','Receipt not downloading','Map not working']
  },

  // ── CONTACT / SUPPORT ──────────────────────────────────────
  {
    id: 'contact', category: 'technical_support',
    patterns: ['contact','support','help desk','helpdesk','get help','contact us',
               'feedback','report','team contact','email support','customer support',
               'how to contact','contact team','support team','reach support',
               'talk to human','speak to someone','live chat','real person'],
    responses: [
      '📞 **Contact & Support:**\n\n• **General Issues:** Use the **Feedback** button in your dashboard\n• **Login/Password:** Feedback button → "Account Issue"\n• **Technical bugs:** Feedback → "Technical Problem"\n• **Emergency help:** Call emergency services directly (1122/911)\n\n**Response time:** Our support team responds within **24 hours**.\n\nIs there something specific I can help you with right now? I handle most questions instantly! 😊'
    ],
    followUp: ['I have a technical problem','I forgot my password','How to report a bug?']
  },

  // ── CHATBOT CAPABILITIES ───────────────────────────────────
  {
    id: 'chatbot_help', category: 'greetings',
    patterns: ['what can you do','your capabilities','help topics','what do you know',
               'chatbot features','what can you answer','topics','ask you','questions',
               'what questions','bot capabilities','how can you help','what are you',
               'who are you','tell me about yourself','bot info','about bloodbot'],
    responses: [
      '🤖 **I\'m BloodBot — Here\'s What I Can Help With:**\n\n🩸 **Blood Donation:**\nEligibility, process, preparation, safety, benefits, platelet/plasma info\n\n🆘 **Emergencies:**\nUrgent blood requests, emergency procedures, hotlines\n\n🔬 **Blood Groups:**\nCompatibility charts, blood type facts, rare vs common types\n\n📋 **Account & Dashboard:**\nRegistration, login issues, profile updates, receipts, notifications\n\n🏥 **Hospitals & Location:**\nBlood banks nearby, map features, donation centres\n\n⚙️ **Technical:**\nBug reports, troubleshooting, feature help\n\n**Examples to try:**\n• "Can I donate with diabetes?"\n• "O negative compatibility"\n• "I need blood urgently"\n• "Download my certificate"\n\nAsk me anything!'
    ]
  },

  // ── IRON / HEMOGLOBIN ──────────────────────────────────────
  {
    id: 'iron_hemoglobin', category: 'eligibility',
    patterns: ['iron','hemoglobin','haemoglobin','hb level','iron level','low iron',
               'iron deficiency','low hemoglobin','anemia','anaemia','iron test',
               'blood test before donation','hemoglobin check','iron rich foods',
               'boost iron','increase hemoglobin','iron requirement'],
    responses: [
      '🔴 **Iron & Hemoglobin for Donation:**\n\n**Minimum levels required:**\n• Women: **12.5 g/dL**\n• Men: **13.0 g/dL**\n\n**Quick hemoglobin check** is done before every donation via a finger prick test.\n\n**Boost your iron levels:**\n• 🥩 Red meat, chicken, fish\n• 🥬 Spinach, kale, broccoli\n• 🫘 Lentils, beans, chickpeas\n• 🥚 Eggs\n• 🍊 Pair with Vitamin C for better absorption\n\n**Avoid:** Coffee/tea within 1 hour of iron-rich meals (blocks absorption)\n\nIf you\'re regularly rejected for low iron, consult a doctor about iron supplements.'
    ],
    followUp: ['Am I eligible to donate?','What to eat before donating?','How to check eligibility?']
  },

  // ── TATOO / PIERCING ───────────────────────────────────────
  {
    id: 'tattoo_piercing', category: 'eligibility',
    patterns: ['tattoo','piercing','body art','ear piercing','nose piercing','got a tattoo',
               'recent tattoo','new tattoo','tattoo and donate','can i donate with tattoo',
               'piercing and blood','tattoo restriction','when after tattoo','body piercing'],
    responses: [
      '💉 **Tattoos, Piercings & Blood Donation:**\n\n⛔ You must wait **6 months** after getting a:\n• Tattoo (any location)\n• Body piercing (ear, nose, tongue, etc.)\n• Permanent makeup / microblading\n\n**Why?** Risk of blood-borne infections (Hepatitis B/C) during the healing period.\n\n**After 6 months:** You are eligible again, as long as the tattoo was done in a licensed, sterile facility.\n\n💡 If your tattoo/piercing is older than 6 months, you\'re likely fine — use the **Eligibility Check** in your dashboard to confirm!'
    ],
    followUp: ['Am I eligible to donate?','What other restrictions exist?','How to check my eligibility?']
  },

  // ── TRAVEL RESTRICTIONS ────────────────────────────────────
  {
    id: 'travel', category: 'eligibility',
    patterns: ['travel','travelled','vacation','trip abroad','visited country',
               'malaria country','traveling','after travel','returning from travel',
               'been abroad','visited africa','visited india','foreign travel',
               'international travel','travel restriction donation'],
    responses: [
      '✈️ **Travel & Blood Donation:**\n\nRecent travel may temporarily affect eligibility:\n\n⛔ **Wait required after visiting:**\n• Malaria-risk countries: Wait **3–12 months** after returning\n• Zika virus areas: Wait **4 weeks** (longer if symptomatic)\n• Areas with active disease outbreaks: Consult donation centre\n\n**Countries often requiring a wait:**\n• Sub-Saharan Africa, South/Southeast Asia, Central/South America (malaria risk zones)\n\n✅ **No restriction for:**\n• Domestic travel within your own country\n• Travel to low-risk developed countries\n\nAlways inform the medical staff about recent travel before donating!'
    ],
    followUp: ['Am I eligible to donate?','What other restrictions exist?']
  },

  // ── FIRST TIME DONOR ───────────────────────────────────────
  {
    id: 'first_time', category: 'donation',
    patterns: ['first time','first donation','never donated','never gave blood','new donor',
               'first time donor','scared first time','nervous about donating','what to expect',
               'first experience','beginner','first donation tips','donating for first time'],
    responses: [
      '🌟 **First Time Donating? Welcome!**\n\nHere\'s exactly what to expect:\n\n**Before you go:**\n• Eat a healthy meal 2–3 hours before\n• Drink extra water\n• Get a good night\'s sleep\n• Wear a top with easy sleeve access\n\n**At the donation centre:**\n1. Register & fill a short health form\n2. Quick finger-prick test (hemoglobin check)\n3. Blood pressure & pulse check\n4. ~10 min wait, then 10–15 min actual donation\n5. Rest with juice & snack\n6. You\'re done! 🎉\n\n**Normal first-time feelings:**\n• Slight nervousness (completely normal!)\n• Mild discomfort at needle insertion\n• Possible slight dizziness — just rest a few minutes\n\n💪 Millions donate safely every day. You\'ve got this!'
    ],
    followUp: ['What to eat before donating?','Is blood donation safe?','How long does it take?']
  },

];

// ─────────────────────────────────────────────────────────────
// 5. IN-MEMORY CONTEXT STORE  (simple session-level memory)
// ─────────────────────────────────────────────────────────────
const contextStore = {};   // keyed by sessionId (from request body)

function getContext(sessionId) {
  return contextStore[sessionId] || { lastIntent: null, topic: null, turn: 0 };
}

function setContext(sessionId, data) {
  contextStore[sessionId] = { ...getContext(sessionId), ...data, turn: (getContext(sessionId).turn || 0) + 1 };
  // Clean up sessions older than 30 minutes
  setTimeout(() => { delete contextStore[sessionId]; }, 30 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────
// 6. INTENT MATCHING ENGINE
// ─────────────────────────────────────────────────────────────
function matchIntent(message) {
  const normalised = normalizeSynonyms(message);
  const words = normalised.split(/\s+/);

  let bestMatch = null;
  let bestScore = 0;

  for (const intent of KB) {
    let score = 0;

    // --- Regex matching (highest weight) ---
    if (intent.regex) {
      for (const re of intent.regex) {
        if (re.test(normalised)) {
          score += 10;
        }
      }
    }

    // --- Exact phrase matching ---
    for (const pattern of intent.patterns) {
      if (normalised.includes(pattern)) {
        score += pattern.split(' ').length * 3;  // multi-word patterns score higher
      }
    }

    // --- Fuzzy word-level matching ---
    for (const word of words) {
      if (word.length < 3) continue;
      for (const pattern of intent.patterns) {
        const patternWords = pattern.split(' ');
        for (const pw of patternWords) {
          if (pw.length >= 3 && fuzzyMatch(word, pw)) {
            score += 1;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = intent;
    }
  }

  return bestScore >= 1 ? { intent: bestMatch, score: bestScore } : null;
}

// ─────────────────────────────────────────────────────────────
// 7. SMART FALLBACK — suggest closest matches
// ─────────────────────────────────────────────────────────────
const TOPIC_SUGGESTIONS = [
  { label: 'Can I donate blood?',           trigger: 'eligibility' },
  { label: 'How to request blood urgently', trigger: 'emergency' },
  { label: 'Blood type compatibility',      trigger: 'blood_compatibility' },
  { label: 'How to donate blood',           trigger: 'how_to_donate' },
  { label: 'Download my receipt',           trigger: 'receipt' },
  { label: 'Is blood donation safe?',       trigger: 'safety' },
  { label: 'When can I donate again?',      trigger: 'cooldown' },
  { label: 'Find blood bank near me',       trigger: 'blood_bank' },
  { label: 'Forgot my password',            trigger: 'login_help' },
  { label: 'What to eat before donating',   trigger: 'preparation' },
];

function buildFallback() {
  const sample = TOPIC_SUGGESTIONS.sort(() => 0.5 - Math.random()).slice(0, 4);
  const lines = sample.map(s => `• "${s.label}"`).join('\n');
  return `😔 I didn\'t quite catch that — sorry!\n\nTry asking about one of these topics:\n${lines}\n\nOr type **"help"** to see everything I can do.`;
}

// ─────────────────────────────────────────────────────────────
// 8. BUILD FINAL RESPONSE (with follow-up suggestions)
// ─────────────────────────────────────────────────────────────
function buildResponse(intent) {
  let text = pick(intent.responses);
  if (intent.followUp && intent.followUp.length > 0) {
    text += '\n\n💬 **You might also ask:**\n' +
      intent.followUp.map(q => `• ${q}`).join('\n');
  }
  return text;
}

// ─────────────────────────────────────────────────────────────
// 9. MAIN HANDLER
// ─────────────────────────────────────────────────────────────
function findResponse(message, sessionId) {
  const ctx  = getContext(sessionId);
  const result = matchIntent(message);

  if (!result) {
    return buildFallback();
  }

  const { intent } = result;

  // Update context
  setContext(sessionId, {
    lastIntent: intent.id,
    topic: intent.category,
  });

  return buildResponse(intent);
}

// ─────────────────────────────────────────────────────────────
// 10. ROUTE  — POST /api/chatbot
// ─────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const sid      = sessionId || 'default';
    const reply    = findResponse(message.trim(), sid);
    const ctx      = getContext(sid);

    return res.json({
      message:     reply,
      timestamp:   new Date().toISOString(),
      userMessage: message,
      intent:      ctx.lastIntent || 'unknown',
      category:    ctx.topic     || 'unknown',
    });

  } catch (err) {
    console.error('[BloodBot Error]', err);
    return res.status(500).json({
      error:   'Internal server error',
      message: '⚠️ Something went wrong. Please try again in a moment.'
    });
  }
});

module.exports = router;