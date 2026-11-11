# Netlify + GitHub দিয়ে পাবলিশ (Vercel লাগবে না)

এই সাইট ইতিমধ্যে GitHub + Netlify দিয়ে পাবলিশ করা থাকলে নতুন
করে কোনো হোস্টিং লাগবে না। চ্যাটের প্রক্সি একই সাইটের সাথে
Netlify Function হিসেবে চলবে: `/.netlify/functions/chat`।

## যা যা করতে হবে (শুধু একবার)

### ১. GitHub-এ নতুন ফাইল আপলোড করুন
রিপোতে এই ফাইলগুলো আপলোড/আপডেট করুন:
- `index.html` (সংশোধিত সংস্করণ — `CHAT_PROXY_URL` ইতিমধ্যে
  `/.netlify/functions/chat` বসানো আছে)
- `netlify/functions/chat.js`
- `netlify.toml`
- `NETLIFY-DEPLOY.md` (ঐচ্ছিক, ডকুমেন্টেশন)

### ২. Netlify-তে API key বসান (সবচেয়ে জরুরি)
1. Netlify ড্যাশবোর্ডে আপনার সাইট খুলুন।
2. Site settings → Environment variables → Add a variable।
3. যোগ করুন:
   - Key: `OPENAI_API_KEY`, Value: আপনার OpenAI API key
   - Key: `ALLOWED_ORIGIN`, Value: আপনার সাইটের ঠিকানা
     (যেমন `https://আপনার-সাইট.netlify.app` — একাধিক হলে কমা
     দিয়ে আলাদা করুন)
   - Key: `OPENAI_MODEL`, Value: `gpt-4o-mini` (ঐচ্ছিক)
4. **key কখনো চ্যাটে, কোডে বা GitHub-এ বসাবেন না।**
5. OpenAI ড্যাশবোর্ডে মাসিক খরচের সীমা (spending limit) বসান।

**খেয়াল রাখবেন:** `ALLOWED_ORIGIN` অবশ্যই বসাতে হবে। না বসালে
চ্যাট সব origin-কে ফিরিয়ে দেয় — সাইট থেকে প্রশ্ন করলেও কোনো
উত্তর আসবে না।

### ৩. Redeploy করুন
Netlify-তে Deploys → Trigger deploy → Deploy site চাপুন, যাতে
নতুন Environment Variable ও Function চালু হয়। GitHub-এ পুশ
করলেই সাধারণত অটো-ডিপ্লয় হয়।

### ৪. টেস্ট করুন
1. লাইভ সাইট খুলুন, চ্যাট খুলে key ছাড়াই প্রশ্ন করুন।
2. উত্তর এলে প্রক্সি ঠিক আছে।
3. উত্তর না এলে দেখুন:
   - “Server API key is not configured” → Netlify-তে
     `OPENAI_API_KEY` বসেছে কিনা ও Redeploy হয়েছে কিনা।
   - “Origin not allowed” → `ALLOWED_ORIGIN`-এ সাইটের ঠিকানা
     হুবহু মিলছে কিনা (না বসানো থাকলেও এই বার্তা আসে)।
   - Function log: Netlify → Functions → chat → লগ দেখুন
     (key-র বিস্তারিত লগে দেখানো হয় না)।

## সুরক্ষা
- System prompt সার্ভার-সাইডে বাঁধা, ভিজিটর বদলাতে পারবে না।
- প্রতি warm instance-এ প্রতি IP-তে মিনিটে ২০টি অনুরোধের সীমা (in-memory — সার্ভারব্যাপী সীমা নয়)।
- মেসেজের দৈর্ঘ্য ও টোকেন সীমা বাঁধা।
- বিল বাড়লে OpenAI-তে key রোটেট করুন ও Netlify-তে আপডেট করুন।
