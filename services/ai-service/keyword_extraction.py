import requests
import json
from typing import List, Optional
import re


class KeywordExtractor:
    """
    A client for extracting keywords from scientific article titles and abstracts
    using a locally running LM Studio model.
    """

    def __init__(
        self,
        model: str = "local-model", # LM Studio often just uses whatever model is currently loaded
        base_url: str = "http://localhost:1234/v1", # LM Studio default URL
        temperature: float = 0.1,
        system_prompt: Optional[str] = None,
    ):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.temperature = temperature
        self.system_prompt = system_prompt or self._default_system_prompt()

    def _default_system_prompt(self) -> str:
        return (
            "You are a precise bilingual (Arabic/English) keyword extractor.\n"
            "أنت أداة استخراج كلمات مفتاحية ثنائية اللغة (عربي/إنجليزي) عالية الدقة.\n\n"
            "Given a scientific article's Title and Abstract, you must produce a single JSON object with EXACTLY this key:\n"
            '  - "keywords": an array of extracted keyword strings (no surrounding punctuation, no duplicates, original language preserved).\n\n'
            "Rules:\n"
            "1. Output ONLY valid JSON — no prose, no markdown fences, no explanation.\n"
            "2. If keywords cannot be determined, return an empty list []."
        )

    def _build_user_message(self, title: str, abstract: str) -> str:
        return (
            f"## Title:\n{title}\n\n"
            f"## Abstract:\n{abstract}\n\n"
            "## Output (JSON only):"
        )

    def extract(self, title: str, abstract: str) -> List[str]:
        if not title and not abstract:
            return []

        user_content = self._build_user_message(title, abstract)

        # Updated payload for OpenAI-compatible API (LM Studio)
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": self.temperature, # Moved to root
            "stream": False,
        }

        # Updated endpoint for OpenAI-compatible API
        url = f"{self.base_url}/chat/completions"
        
        response = requests.post(url, json=payload)
        response.raise_for_status()

        data = response.json()
        
        # Updated parsing for OpenAI-compatible response
        if "choices" not in data or not data["choices"]:
            raise ValueError(f"Unexpected API response format: {data}")

        model_output = data["choices"][0]["message"]["content"].strip()
        
        if not model_output:
            return []

        try:
            parsed = json.loads(model_output)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", model_output, re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group(0))
                except json.JSONDecodeError:
                    raise json.JSONDecodeError("Model output contains no valid JSON", model_output, 0)
            else:
                raise

        keywords = parsed.get("keywords", [])
        if not isinstance(keywords, list):
            keywords = []
            
        seen = set()
        cleaned = []
        for kw in keywords:
            if kw and kw not in seen:
                seen.add(kw)
                cleaned.append(kw)
        return cleaned


# --------------------- TEST ---------------------
if __name__ == "__main__":
    # Ensure LM Studio's local server is running on port 1234
    extractor = KeywordExtractor() 

    title = "مشهد البرق ودلالاته في شعر المغمورين من العصر الغرناطي"
    abstract = (
        "يقوم البحث على بيان المشاهد المختلفة للبرق في شعر المغمورين من العصر الغرناطي، "
        "وهو يتمثل في دراسة البرق من جانبين؛ الجانب الأول (العناصر المكونة لمشهد البرق) "
        "ويعني التعامل مع البرق استنادًا إلى كونه حقيقة، وما يتضمنه ذلك من عناصره الواضحة "
        "من بريق وضوء وسرعة وحرارة وما سوى ذلك، أما الجانب الثاني (فنية مشهد البرق) فهو "
        "يقوم على الأشياء التي تجتلَب عناصر البرق من أجلها في صور التشبيه والاستعارة والكناية، "
        "كالثغر والكف والوعد الكاذب والوجه، وكل ذلك مشفوع بالشواهد الشعرية، مبينًا الجانب الذي "
        "يقصده الشاعر في البرق، ويستند البحث إلى المنهج الوصفي والتحليلي في تعامله مع هذه "
        "الظاهرة، راصدًا أهم شواهده، ومحللًا إياها."
    )

    try:
        keywords = extractor.extract(title, abstract)
        print("✅ Extracted keywords:", keywords)
    except requests.exceptions.RequestException as e:
        print(f"❌ Network error: {e}")
    except json.JSONDecodeError as e:
        print(f"❌ JSON parsing error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")