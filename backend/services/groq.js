require('dotenv').config();
const axios     = require('axios');
const NodeCache = require('node-cache');
const { query } = require('../db/pool');

const cache = new NodeCache({ stdTTL: 3600 });
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM = `You are SamayalAI — a world-class South Indian cooking expert and Tamil culinary guide.
You specialise in Tamil Nadu, Chettinad, Kerala, Andhra Pradesh, Telangana, Karnataka, Kongunadu cuisines.

STRICT RULES — never break these:
1. Every single ingredient MUST show both languages:
   English name + quantity / தமிழ் பெயர் + அளவு
   Examples:
   • Tamarind 1 lemon-sized ball / புளி 1 எலுமிச்சை அளவு
   • Toor Dal 1 cup / துவரம் பருப்பு 1 கப்
   • Mustard Seeds 1 tsp / கடுகு 1 தேக்கரண்டி
   • Curry Leaves 1 sprig / கறிவேப்பிலை 1 கொத்து
   • Sesame Oil 2 tbsp / நல்லெண்ணெய் 2 தேக்கரண்டி
   • Sambar Onions 10 / சாம்பார் வெங்காயம் 10
   • Dry Red Chilli 3 / வர மிளகாய் 3
   • Fenugreek Seeds ¼ tsp / வெந்தயம் ¼ தேக்கரண்டி
   • Asafoetida a pinch / பெருங்காயம் ஒரு சிட்டிகை
2. Always recommend Tamil YouTube channels: Village Cooking Channel (35M+), Madras Samayal (5M+), HomeCooking Tamil (4M+)
3. Give exact measurements — never vague
4. Be warm and encouraging, use occasional Tamil words
5. Format with clear sections and emojis`;

async function callGroq(messages, maxTokens) {
  const resp = await axios.post(GROQ_URL, {
    model: GROQ_MODEL,
    messages: [{ role: 'system', content: SYSTEM }, ...messages],
    max_tokens: maxTokens || 2500,
    temperature: 0.5,
  }, {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    timeout: 30000,
  });
  return resp.data.choices[0].message.content;
}

async function getChatResponse(messages, userProfile) {
  const ctx = userProfile
    ? `User is from ${userProfile.city || ''} ${userProfile.state || 'Tamil Nadu'}, spice: ${userProfile.spice_level || 'medium'}, diet: ${userProfile.dietary_preference || 'both'}.`
    : '';
  return callGroq([
    { role: 'system', content: ctx },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ], 2500);
}

async function getRecipe(dishName, userProfile, userId, servings) {
  const key = 'recipe:' + dishName.toLowerCase().replace(/\s+/g, '_').slice(0, 60);
  const hit = cache.get(key);
  if (hit) return { data: hit, fromCache: true };

  const srv = servings ? ` for ${servings} people` : '';
  const profile = userProfile
    ? `User: ${userProfile.city || ''} ${userProfile.state || 'Tamil Nadu'}, spice: ${userProfile.spice_level || 'medium'}`
    : '';

  const prompt = `${profile}
Generate a complete recipe for: "${dishName}${srv}"
Respond ONLY with valid JSON (absolutely no markdown fences, no text outside JSON):
{
  "dish_name":"Pulikolambu","dish_name_tamil":"புளிக்குழம்பு","region":"Tamil Nadu",
  "overview":{"cuisine":"Tamil Nadu","servings":4,"difficulty":"Medium","prep_time":"15 mins","cook_time":"30 mins","total_time":"45 mins","calories_per_serving":180},
  "ingredients":[{"en":"Tamarind","ta":"புளி","quantity":"1 lemon-sized ball","quantity_ta":"1 எலுமிச்சை அளவு","prep_note":"soaked in 2 cups warm water, extract juice"},{"en":"Sesame Oil","ta":"நல்லெண்ணெய்","quantity":"2 tbsp","quantity_ta":"2 தேக்கரண்டி","prep_note":""},{"en":"Mustard Seeds","ta":"கடுகு","quantity":"1 tsp","quantity_ta":"1 தேக்கரண்டி","prep_note":""},{"en":"Curry Leaves","ta":"கறிவேப்பிலை","quantity":"1 sprig","quantity_ta":"1 கொத்து","prep_note":""},{"en":"Dry Red Chilli","ta":"வர மிளகாய்","quantity":"3","quantity_ta":"3","prep_note":"broken in half"},{"en":"Sambar Powder","ta":"சாம்பார் பொடி","quantity":"2 tsp","quantity_ta":"2 தேக்கரண்டி","prep_note":""},{"en":"Turmeric","ta":"மஞ்சள் தூள்","quantity":"½ tsp","quantity_ta":"½ தேக்கரண்டி","prep_note":""},{"en":"Salt","ta":"உப்பு","quantity":"1½ tsp","quantity_ta":"1½ தேக்கரண்டி","prep_note":"or to taste"}],
  "instructions":[{"step":1,"title":"Prepare tamarind water","description":"Soak tamarind in 2 cups warm water for 10 minutes. Squeeze and strain to get thick tamarind juice. Discard fibres.","duration":"10 mins","flame":"no heat","tip":"Warm water extracts faster than cold"},{"step":2,"title":"Temper the spices","description":"Heat sesame oil in a heavy pan over medium flame. Add mustard seeds and wait until they splutter. Add curry leaves and dry red chilli. Fry for 30 seconds.","duration":"2 mins","flame":"medium","tip":"Use sesame oil (nallennai) — it is the soul of pulikolambu"},{"step":3,"title":"Add tamarind and spices","description":"Pour tamarind water into the pan. Add sambar powder, turmeric, and salt. Stir well.","duration":"2 mins","flame":"medium","tip":""},{"step":4,"title":"Boil until thickened","description":"Bring to a boil then simmer on low flame for 20 minutes until the raw tamarind smell disappears and oil separates on top.","duration":"20 mins","flame":"low","tip":"The kolambu is ready when oil floats on top — this is the sign!"}],
  "cooking_tips":["Always use sesame oil (நல்லெண்ணெய்) — it gives the authentic flavour","The kolambu thickens as it cools — make it slightly thinner than desired","Store in fridge for up to 5 days — tastes better the next day"],
  "nutrition_per_serving":{"calories":180,"protein_g":2,"carbs_g":22,"fat_g":9,"fiber_g":3,"sodium_mg":380},
  "health_score":{"overall":7.5,"rating":"Healthy","diabetic_friendly":true,"diabetic_note":"Low glycemic, high in tamarind antioxidants","gym_friendly":false,"weight_loss":true,"notes":"Rich in Vitamin C, aids digestion"},
  "substitutions":[{"original":"Sesame Oil","substitute":"Coconut Oil","note":"Different flavour but acceptable"},{"original":"Sambar Powder","substitute":"Red Chilli Powder + Coriander Powder","note":"Use 1 tsp each"}],
  "youtube_recommendations":[{"channel":"Madras Samayal","search_query":"pulikolambu recipe madras samayal","url":"https://www.youtube.com/results?search_query=pulikolambu+recipe+madras+samayal","why":"Authentic Tamil home style, 5M+ subscribers"},{"channel":"Village Cooking Channel","search_query":"pulikolambu village cooking","url":"https://www.youtube.com/results?search_query=pulikolambu+village+cooking+channel","why":"Traditional large-scale cooking, 35M+ subscribers"},{"channel":"HomeCooking Tamil","search_query":"pulikolambu homecooking show","url":"https://www.youtube.com/results?search_query=pulikolambu+homecooking+tamil","why":"Clear step-by-step method, 4M+ subscribers"}],
  "grocery_list":["Tamarind 50g","Sesame Oil 100ml","Sambar Powder 50g","Mustard Seeds","Curry Leaves","Dry Red Chilli"],
  "regional_note":"Pulikolambu is a staple of Tamil homes — every family has their own recipe. The Chettinad version adds more spices.",
  "fun_fact":"புளிக்குழம்பு literally means sour curry. Tamarind (புளி) is its soul and cannot be substituted."
}`;

  const raw   = await callGroq([{ role: 'user', content: prompt }], 3500);
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const data  = JSON.parse(clean);

  try {
    await query(
      'INSERT INTO recipes_cache (dish_name,dish_name_tamil,region,recipe_data,youtube_links) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [data.dish_name, data.dish_name_tamil, data.region, JSON.stringify(data), JSON.stringify(data.youtube_recommendations || [])]
    );
  } catch (_) {}

  cache.set(key, data);
  return { data, fromCache: false };
}

async function getMealPlan(userProfile, userId) {
  const profile = userProfile || {};
  const prompt = `Generate a 7-day South Indian meal plan for:
Location: ${profile.city || ''} ${profile.state || 'Tamil Nadu'}
Diet: ${profile.dietary_preference || 'both'}
Spice: ${profile.spice_level || 'medium'}
Health goals: ${(profile.health_goals || []).join(', ') || 'balanced'}
Favorites: ${(profile.favorite_dishes || []).join(', ') || 'various'}

Respond ONLY with valid JSON (no markdown):
{"week_summary":"Balanced 7-day South Indian plan","total_avg_daily_calories":1800,"days":[{"day":1,"day_name":"Monday","total_calories":1820,"meals":{"breakfast":{"dish":"Idli with Sambar","dish_tamil":"இட்லி சாம்பார்","calories":320,"time":"7:30 AM","ingredients_summary":"Rice idli x3, toor dal sambar, coconut chutney","prep_time":"20 mins","health_note":"High protein, good probiotics"},"morning_snack":{"dish":"Filter Coffee & Banana","dish_tamil":"ஃபில்டர் காபி வாழைப்பழம்","calories":130,"time":"10:30 AM","ingredients_summary":"Coffee decoction, milk, banana","prep_time":"5 mins","health_note":"Natural energy boost"},"lunch":{"dish":"Rice, Sambar, Rasam, Papad","dish_tamil":"சாதம் சாம்பார் ரசம் பப்படம்","calories":620,"time":"1:00 PM","ingredients_summary":"Steamed rice, vegetable sambar, pepper rasam, papad","prep_time":"45 mins","health_note":"Complete balanced meal"},"evening_snack":{"dish":"Murukku & Tea","dish_tamil":"முறுக்கு தேநீர்","calories":200,"time":"5:00 PM","ingredients_summary":"Rice flour murukku, spiced tea","prep_time":"5 mins","health_note":"Energy recharge"},"dinner":{"dish":"Chapati with Dal","dish_tamil":"சப்பாத்தி பருப்பு","calories":480,"time":"8:00 PM","ingredients_summary":"Whole wheat chapati, toor dal curry","prep_time":"30 mins","health_note":"Light dinner, high fibre"}}}],"shopping_list":{"vegetables":["Tomatoes 1kg","Onions 500g","Brinjal 500g"],"grains_pulses":["Toor Dal 500g","Rice 2kg","Urad Dal 200g"],"spices":["Sambar Powder 100g","Turmeric 50g","Mustard Seeds 50g"],"dairy":["Milk 2L","Curd 500g","Ghee 200g"],"others":["Tamarind 100g","Coconut 2","Sesame Oil 500ml"]},"weekly_tips":["Soak idli batter Sunday night","Make sambar powder in bulk","Keep tamarind extract ready in fridge"]}`;

  const raw   = await callGroq([{ role: 'user', content: prompt }], 4096);
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const data  = JSON.parse(clean);

  try {
    const ws = new Date();
    ws.setDate(ws.getDate() - ws.getDay() + 1);
    await query(
      'INSERT INTO meal_plans (user_id,week_start,plan_data,total_calories) VALUES ($1,$2,$3,$4)',
      [userId, ws.toISOString().split('T')[0], JSON.stringify(data), data.total_avg_daily_calories || 1800]
    );
  } catch (_) {}

  return data;
}

module.exports = { getChatResponse, getRecipe, getMealPlan };
