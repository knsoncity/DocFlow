export type RealtimeLookupKind = "weather" | "news" | "search";

export type RealtimeLookupItem = {
  title: string;
  url?: string;
  snippet?: string;
  source?: string;
  publishedAt?: string;
};

export type RealtimeLookupResult = {
  kind: RealtimeLookupKind;
  query: string;
  generatedAt: string;
  summary: string;
  items: RealtimeLookupItem[];
  note?: string;
};

const FETCH_TIMEOUT_MS = 8000;
const WEATHER_PATTERN =
  /날씨|기온|강수|비 와|비오|눈 와|습도|미세먼지|temperature|weather/i;
const NEWS_PATTERN =
  /뉴스|속보|헤드라인|기사|최신.*뉴스|최근.*뉴스|today.*news/i;
const SEARCH_PATTERN =
  /검색|찾아줘|알아봐|웹에서|최신|최근|실시간|업데이트|현황|주가|환율/i;
const WEATHER_LOCATION_ALIASES: Record<string, string[]> = {
  서울: ["Seoul", "Seoul, KR"],
  서울시: ["Seoul", "Seoul, KR"],
  서울특별시: ["Seoul", "Seoul, KR"],
  부산: ["Busan", "Busan, KR"],
  부산시: ["Busan", "Busan, KR"],
  대구: ["Daegu", "Daegu, KR"],
  인천: ["Incheon", "Incheon, KR"],
  광주: ["Gwangju", "Gwangju, KR"],
  대전: ["Daejeon", "Daejeon, KR"],
  울산: ["Ulsan", "Ulsan, KR"],
  세종: ["Sejong", "Sejong, KR"],
  제주: ["Jeju", "Jeju, KR"],
  제주도: ["Jeju", "Jeju, KR"],
  수원: ["Suwon", "Suwon, KR"],
  성남: ["Seongnam", "Seongnam, KR"],
  판교: ["Pangyo", "Pangyo, KR"],
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

async function fetchText(url: string) {
  const timeout = withTimeout(FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: timeout.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Lookup failed with status ${response.status}`);
    }

    return response.text();
  } finally {
    timeout.clear();
  }
}

async function fetchJson<T>(url: string) {
  const timeout = withTimeout(FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
      },
      signal: timeout.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Lookup failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    timeout.clear();
  }
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'");
}

function stripTags(text: string) {
  return decodeHtmlEntities(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function formatPublishedAt(text?: string) {
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function decodeDuckDuckGoUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return rawUrl;
  }
}

function getWeatherLocationCandidates(location: string) {
  const normalized = location.trim();
  const aliasMatches = Object.entries(WEATHER_LOCATION_ALIASES)
    .filter(([key]) => normalized.includes(key))
    .flatMap(([, aliases]) => aliases);

  return Array.from(
    new Set([normalized, ...aliasMatches].filter(Boolean))
  );
}

function normalizeSearchQuery(prompt: string) {
  const normalized = prompt
    .replace(/검색(해서|해)?/gi, " ")
    .replace(/찾아(줘|봐)?/gi, " ")
    .replace(/알아봐(줘)?/gi, " ")
    .replace(/웹에서/gi, " ")
    .replace(/실시간/gi, " ")
    .replace(/최신/gi, " ")
    .replace(/최근/gi, " ")
    .replace(/업데이트/gi, " ")
    .replace(/현황/gi, " ")
    .replace(/알려줘/gi, " ")
    .replace(/[?]/g, " ");

  return normalizeWhitespace(normalized) || normalizeWhitespace(prompt);
}

function normalizeNewsQuery(prompt: string) {
  const normalized = prompt
    .replace(/뉴스|속보|헤드라인|기사/gi, " ")
    .replace(/최신|최근|오늘/gi, " ")
    .replace(/알려줘|보여줘|정리해줘/gi, " ")
    .replace(/[?]/g, " ");

  return normalizeWhitespace(normalized) || normalizeWhitespace(prompt);
}

const GREETING_WORDS = /^(안녕|안녕하세요|하이|헬로|hi|hello)[,.]?\s*/i;

function extractWeatherLocation(prompt: string) {
  const cleaned = prompt
    .replace(GREETING_WORDS, " ")
    .replace(/오늘|내일|지금|현재|이번 주|이번주|실시간/gi, " ")
    .replace(/날씨|기온|강수|습도|미세먼지|비 와|비오|눈 와/gi, " ")
    .replace(/어때|어떻|알려줘|확인해줘|검색해줘|좀|봐줘/gi, " ")
    .replace(/[?,!.]/g, " ");

  const normalized = normalizeWhitespace(cleaned);
  if (!normalized || normalized.length < 2) return null;
  return normalized || null;
}

function weatherCodeToKorean(code?: number) {
  switch (code) {
    case 0:
      return "맑음";
    case 1:
    case 2:
      return "대체로 맑음";
    case 3:
      return "흐림";
    case 45:
    case 48:
      return "안개";
    case 51:
    case 53:
    case 55:
      return "이슬비";
    case 61:
    case 63:
    case 65:
      return "비";
    case 71:
    case 73:
    case 75:
      return "눈";
    case 80:
    case 81:
    case 82:
      return "소나기";
    case 95:
    case 96:
    case 99:
      return "뇌우";
    default:
      return "기상 정보";
  }
}

async function lookupWeather(prompt: string): Promise<RealtimeLookupResult> {
  const location = extractWeatherLocation(prompt);

  if (!location) {
    return {
      kind: "weather",
      query: prompt,
      generatedAt: new Date().toISOString(),
      summary: "날씨를 확인하려면 지역명이 필요합니다.",
      items: [],
      note: "예: 서울 날씨, 부산 내일 날씨",
    };
  }

  type GeocodingPlace = {
    name: string;
    country?: string;
    admin1?: string;
    latitude: number;
    longitude: number;
    timezone?: string;
  };

  type GeocodingResponse = {
    results?: GeocodingPlace[];
  };

  let place: GeocodingPlace | undefined;

  for (const candidate of getWeatherLocationCandidates(location)) {
    const geocoding = await fetchJson<GeocodingResponse>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        candidate
      )}&count=1&language=ko&format=json`
    );

    if (geocoding.results?.[0]) {
      place = geocoding.results[0];
      break;
    }
  }

  if (!place) {
    return {
      kind: "weather",
      query: prompt,
      generatedAt: new Date().toISOString(),
      summary: `${location} 지역을 찾지 못했습니다.`,
      items: [],
      note: "도시명이나 지역명을 조금 더 구체적으로 입력해 주세요.",
    };
  }

  type ForecastResponse = {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      relative_humidity_2m?: number;
      wind_speed_10m?: number;
      weather_code?: number;
    };
    daily?: {
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
    };
  };

  const forecast = await fetchJson<ForecastResponse>(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`
  );

  const placeLabel = [place.name, place.admin1, place.country]
    .filter(Boolean)
    .join(", ");
  const current = forecast.current;
  const daily = forecast.daily;

  const summary = `${placeLabel} 현재 ${weatherCodeToKorean(
    current?.weather_code
  )}, 기온 ${current?.temperature_2m ?? "-"}°C, 체감 ${
    current?.apparent_temperature ?? "-"
  }°C, 오늘 최고 ${daily?.temperature_2m_max?.[0] ?? "-"}°C / 최저 ${
    daily?.temperature_2m_min?.[0] ?? "-"
  }°C입니다.`;

  return {
    kind: "weather",
    query: prompt,
    generatedAt: new Date().toISOString(),
    summary,
    note:
      daily?.precipitation_probability_max?.[0] !== undefined
        ? `강수 확률 최대 ${daily.precipitation_probability_max[0]}%`
        : undefined,
    items: [
      {
        title: placeLabel,
        snippet: `습도 ${current?.relative_humidity_2m ?? "-"}%, 풍속 ${
          current?.wind_speed_10m ?? "-"
        }km/h`,
        source: "Open-Meteo",
        url: `https://open-meteo.com/`,
      },
    ],
  };
}

async function lookupNews(prompt: string): Promise<RealtimeLookupResult> {
  const query = normalizeNewsQuery(prompt);
  const xml = await fetchText(
    `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=ko&gl=KR&ceid=KR:ko`
  );

  const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi))
    .slice(0, 6)
    .map((match) => {
      const itemXml = match[1];
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
      const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const sourceMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

      return {
        title: stripTags(titleMatch?.[1] ?? "제목 없음"),
        url: stripTags(linkMatch?.[1] ?? ""),
        source: stripTags(sourceMatch?.[1] ?? "Google News"),
        publishedAt: stripTags(pubDateMatch?.[1] ?? ""),
      } satisfies RealtimeLookupItem;
    })
    .filter((item) => item.url);

  return {
    kind: "news",
    query,
    generatedAt: new Date().toISOString(),
    summary:
      items.length > 0
        ? `"${query}" 관련 최신 뉴스 ${items.length}건을 찾았습니다.`
        : `"${query}" 관련 최신 뉴스를 찾지 못했습니다.`,
    items,
    note: "Google News RSS 기준",
  };
}

async function lookupSearch(prompt: string): Promise<RealtimeLookupResult> {
  const query = normalizeSearchQuery(prompt);
  const html = await fetchText(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  );

  const titleRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex =
    /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>/gi;

  const titles = Array.from(html.matchAll(titleRegex)).slice(0, 6);
  const snippets = Array.from(html.matchAll(snippetRegex)).slice(0, 6);

  const items = titles.map((match, index) => {
    const snippetMatch = snippets[index];
    return {
      title: stripTags(match[2]),
      url: decodeDuckDuckGoUrl(match[1]),
      snippet: stripTags(snippetMatch?.[1] ?? snippetMatch?.[2] ?? ""),
      source: "DuckDuckGo",
    } satisfies RealtimeLookupItem;
  });

  return {
    kind: "search",
    query,
    generatedAt: new Date().toISOString(),
    summary:
      items.length > 0
        ? `"${query}" 검색 결과 ${items.length}건을 찾았습니다.`
        : `"${query}" 검색 결과를 찾지 못했습니다.`,
    items,
    note: "DuckDuckGo HTML 검색 기준",
  };
}

export function shouldPerformRealtimeLookup(prompt: string) {
  return (
    WEATHER_PATTERN.test(prompt) ||
    NEWS_PATTERN.test(prompt) ||
    SEARCH_PATTERN.test(prompt)
  );
}

export async function performRealtimeLookup(prompt: string) {
  if (WEATHER_PATTERN.test(prompt)) {
    return lookupWeather(prompt);
  }

  if (NEWS_PATTERN.test(prompt)) {
    return lookupNews(prompt);
  }

  if (SEARCH_PATTERN.test(prompt)) {
    return lookupSearch(prompt);
  }

  return null;
}

export function formatRealtimeLookupContext(result: RealtimeLookupResult) {
  const items = result.items
    .map((item, index) => {
      const parts = [
        `${index + 1}. ${item.title}`,
        item.source ? `- 출처: ${item.source}` : "",
        item.publishedAt ? `- 시각: ${item.publishedAt}` : "",
        item.snippet ? `- 요약: ${item.snippet}` : "",
        item.url ? `- 링크: ${item.url}` : "",
      ].filter(Boolean);

      return parts.join("\n");
    })
    .join("\n");

  return `[실시간 조회 결과]
- 종류: ${result.kind}
- 질의: ${result.query}
- 조회 시각: ${result.generatedAt}
- 요약: ${result.summary}
${result.note ? `- 참고: ${result.note}` : ""}

[조회 항목]
${items || "- 결과 없음"}`.trim();
}

export function buildRealtimeReply(result: RealtimeLookupResult) {
  if (result.kind === "weather") {
    const item = result.items[0];

    return [
      result.summary,
      result.note ? `- ${result.note}` : "",
      item?.snippet ? `- ${item.snippet}` : "",
      item?.url ? `- 출처: ${item.url}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (result.items.length === 0) {
    return [result.summary, result.note ? `- ${result.note}` : ""]
      .filter(Boolean)
      .join("\n");
  }

  const items = result.items.slice(0, 4).map((item, index) => {
    const meta = [
      item.source,
      formatPublishedAt(item.publishedAt),
      item.snippet,
    ]
      .filter(Boolean)
      .join(" · ");

    return [
      `${index + 1}. ${item.title}`,
      meta ? `   ${meta}` : "",
      item.url ? `   ${item.url}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    result.summary,
    "",
    ...items,
    result.note ? `\n참고: ${result.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
