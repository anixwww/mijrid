import { GoogleGenAI } from '@google/genai';
import express from 'express';
import { requireAdmin } from '../auth.js';

export function createAiRouter(): express.Router {
  const router = express.Router();

  router.post('/api/ai/generate-biography', requireAdmin, async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: 'Не налаштовано GEMINI_API_KEY. Додайте ключ у Settings > Secrets.',
        });
      }

      const payload = req.body || {};
      const personData =
        payload.personData && typeof payload.personData === 'object' ? payload.personData : null;
      if (!personData) {
        return res.status(400).json({
          success: false,
          error: 'Не передано дані особи для аналізу.',
        });
      }

      const cleanStr = (v: unknown, maxLen = 4000): string =>
        typeof v === 'string' ? v.trim().slice(0, maxLen) : '';
      const cleanArr = (v: unknown, maxItems = 25): string[] =>
        Array.isArray(v)
          ? v
              .map((item) => (typeof item === 'string' ? item.trim() : ''))
              .filter(Boolean)
              .slice(0, maxItems)
          : [];

      const fullName = cleanStr(personData.fullName, 200);
      const patronymic = cleanStr(personData.patronymic, 120);
      const maidenName = cleanStr(personData.maidenName, 120);
      const nickname = cleanStr(personData.nickname, 120);
      const clanName = cleanStr(personData.clanName, 120);
      const gender = cleanStr(personData.gender, 30);

      const birthInfo = cleanStr(personData.birthInfo, 250);
      const deathInfo = cleanStr(personData.deathInfo, 250);
      const isDeceased = Boolean(personData.isDeceased);

      const birthPlace = cleanStr(personData.birthPlace, 250);
      const residencePlace = cleanStr(personData.residencePlace, 250);
      const migrationNotes = cleanStr(personData.migrationNotes, 600);
      const deathPlace = cleanStr(personData.deathPlace, 250);
      const burialPlace = cleanStr(personData.burialPlace, 250);
      const deathCause = cleanStr(personData.deathCause, 250);

      const education = cleanStr(personData.education, 400);
      const profession = cleanStr(personData.profession, 300);
      const workplaceNotes = cleanStr(personData.workplaceNotes, 500);
      const midwife = cleanStr(personData.midwife, 200);
      const godparents = cleanStr(personData.godparents, 300);
      const houseNumber = cleanStr(personData.houseNumber, 60);

      const notes = cleanStr(personData.notes, 4000);
      const interestingStories = cleanStr(personData.interestingStories, 4000);
      const ghostNote = cleanStr(personData.ghostNote, 1000);
      const existingBiography = cleanStr(personData.existingBiography, 4000);

      const parents = cleanArr(personData.parents);
      const spouses = cleanArr(personData.spouses);
      const children = cleanArr(personData.children);
      const siblings = cleanArr(personData.siblings);
      const approvedMemories = cleanArr(personData.approvedMemories, 15);
      const documents = cleanArr(personData.documents, 20);

      const factLines: string[] = [];
      if (fullName) factLines.push(`Повне ім'я: ${fullName}`);
      if (patronymic) factLines.push(`По батькові: ${patronymic}`);
      if (maidenName) factLines.push(`Дівоче прізвище: ${maidenName}`);
      if (nickname) factLines.push(`Прізвисько / у родині: ${nickname}`);
      if (clanName) factLines.push(`Рід / гілка: ${clanName}`);
      if (gender === 'male') factLines.push('Стать: чоловіча');
      else if (gender === 'female') factLines.push('Стать: жіноча');

      if (birthInfo) factLines.push(`Дата/рік народження: ${birthInfo}`);
      if (birthPlace) factLines.push(`Місце народження: ${birthPlace}`);
      if (houseNumber) factLines.push(`Номер дому: №${houseNumber}`);
      if (residencePlace) factLines.push(`Місце проживання: ${residencePlace}`);
      if (migrationNotes) factLines.push(`Переїзди та міграція: ${migrationNotes}`);

      if (isDeceased || deathInfo || deathPlace || burialPlace || deathCause) {
        factLines.push(`Статус: помер(ла)`);
      }
      if (deathInfo) factLines.push(`Дата/рік смерті: ${deathInfo}`);
      if (deathPlace) factLines.push(`Місце смерті: ${deathPlace}`);
      if (burialPlace) factLines.push(`Місце поховання: ${burialPlace}`);
      if (deathCause) factLines.push(`Причина смерті: ${deathCause}`);

      if (education) factLines.push(`Освіта: ${education}`);
      if (profession) factLines.push(`Професія / рід занять: ${profession}`);
      if (workplaceNotes) factLines.push(`Місце роботи / служба: ${workplaceNotes}`);
      if (midwife) factLines.push(`Повитуха: ${midwife}`);
      if (godparents) factLines.push(`Хресні батьки / куми: ${godparents}`);

      if (parents.length > 0) factLines.push(`Батьки: ${parents.join(', ')}`);
      if (spouses.length > 0) factLines.push(`Шлюб / партнерство: ${spouses.join(', ')}`);
      if (children.length > 0) factLines.push(`Діти: ${children.join(', ')}`);
      if (siblings.length > 0) factLines.push(`Брати/сестри: ${siblings.join(', ')}`);

      if (notes) factLines.push(`Примітки з картки:\n${notes}`);
      if (interestingStories && interestingStories !== notes) {
        factLines.push(`Цікаві історії та перекази:\n${interestingStories}`);
      }
      if (ghostNote) factLines.push(`Коротка нотатка на картці: ${ghostNote}`);
      if (approvedMemories.length > 0) {
        factLines.push(`Схвалені родинні уточнення і спогади:\n- ${approvedMemories.join('\n- ')}`);
      }
      if (documents.length > 0) {
        factLines.push(`Пов'язані архівні документи / фотографії:\n- ${documents.join('\n- ')}`);
      }
      if (existingBiography) {
        factLines.push(
          `Попередня версія біографії (можна врахувати й гармонійно оновити):\n${existingBiography}`
        );
      }

      if (factLines.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'У картці недостатньо даних (дат, приміток чи інших фактів) для створення біографії.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction =
        'Ти — дбайливий, точний український біограф і дослідник родинної історії. ' +
        'Твоє завдання — проаналізувати надані дати, місця, родинні звʼязки, примітки та спогади з картки родового дерева й скласти з них звʼязний, теплий і грамотний текст біографії українською мовою. ' +
        'Суворі правила: ' +
        '1) Спирайся ВИКЛЮЧНО на надані факти, дати, примітки та імена. КАТЕГОРИЧНО ЗАБОРОНЕНО вигадувати неіснуючі дати, роки, події, професії, населені пункти чи родичів. ' +
        '2) Якщо фактів небагато, напиши стислий, але цілісний і природний текст (1 абзац) на основі того, що є. Якщо даних багато — 2–3 логічно структуровані абзаци у хронологічному порядку (походження/народження → життя, праця, переїзди, родина → спогади/завершення життєвого шляху). ' +
        '3) Повертай лише готовий чистий текст біографії без заголовків, маркованих списків, лапок чи технічних коментарів.';

      const userPrompt = `Ось наявні дані та примітки з картки особи:\n\n${factLines.join('\n')}\n\nСклади зв'язну біографію цієї особи українською мовою.`;

      let lastErr: unknown = null;
      let generatedText = '';

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: userPrompt,
            config: {
              systemInstruction,
            },
          });
          generatedText = (response.text || '').trim();
          if (generatedText) break;
          lastErr = new Error('Порожня відповідь від моделі Gemini');
        } catch (err: any) {
          lastErr = err;
          const status = err?.status || err?.code;
          const msg = String(err?.message || '');
          const isTransient =
            status === 429 ||
            status === 503 ||
            status === 'UNAVAILABLE' ||
            /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|fetch failed|ECONNRESET/i.test(msg);
          if (!isTransient || attempt === 2) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
        }
      }

      if (!generatedText) {
        throw lastErr || new Error('Модель не повернула текст біографії');
      }

      return res.json({
        success: true,
        biography: generatedText,
      });
    } catch (err: any) {
      console.error('Error generating AI biography:', err);
      const rawMsg = String(err?.message || '');
      const status = typeof err?.status === 'number' ? err.status : undefined;

      if (
        /API_KEY_INVALID|PERMISSION_DENIED|API key not valid/i.test(rawMsg) ||
        status === 401 ||
        status === 403
      ) {
        return res.status(502).json({
          success: false,
          error: 'Ключ GEMINI_API_KEY недійсний або не має прав доступу. Перевірте Settings > Secrets.',
        });
      }
      if (/RESOURCE_EXHAUSTED|429/i.test(rawMsg) || status === 429) {
        return res.status(429).json({
          success: false,
          error: 'Перевищено ліміт запитів до Gemini API. Спробуйте ще раз трохи пізніше.',
        });
      }
      return res.status(500).json({
        success: false,
        error: rawMsg || 'Не вдалося згенерувати біографію за допомогою AI',
      });
    }
  });

  return router;
}
