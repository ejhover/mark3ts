function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

export function normalizeTicker(value) {
  return normalizeText(value).replace(/[^A-Za-z.\-]/g, "").toUpperCase();
}

function isLikelyTickerSymbol(ticker) {
  // Accept common US symbol shapes like AAPL, BRK.B, BF.B.
  return /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(String(ticker || ""));
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function getArticleSignalWeight(item) {
  const credibility = clamp01(item?.source_credibility_score ?? 0.6);
  const importance = clamp01(item?.importance_score ?? 0.5);
  const uncertainty = clamp01(item?.uncertainty_score ?? 0.35);
  const certainty = 1 - uncertainty;
  return Math.max(0.2, credibility * 0.4 + importance * 0.4 + certainty * 0.2);
}

function getConvictionScore(weightedAverageScore, directionalAgreement, articleCount) {
  const strength = clamp01(Math.abs(weightedAverageScore));
  const agreement = clamp01(directionalAgreement);
  const sample = Math.max(0, Number(articleCount) || 0);
  const shrinkage = sample / (sample + 3);
  return clamp01(strength * (0.6 + agreement * 0.4) * shrinkage);
}

function getDirectionalAgreement(bullishWeight, bearishWeight) {
  const bullish = Number(bullishWeight) || 0;
  const bearish = Number(bearishWeight) || 0;
  const total = bullish + bearish;
  if (!total) return 0;
  return Math.max(bullish, bearish) / total;
}

export function getSignalStrength(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return 0;
  return Math.abs(numericScore);
}

export function isArticleAnalyzed(item) {
  return item?.analysis_status === "complete" && Number.isFinite(Number(item?.sentiment_score));
}

function getTickerEntities(item) {
  return (item?.entities || [])
    .map((entity) => ({
      ...entity,
      ticker: normalizeTicker(entity?.ticker || entity?.name),
    }))
    .filter((entity) => (
      entity.ticker &&
      isLikelyTickerSymbol(entity.ticker) &&
      (entity.type === "ticker" || entity.ticker === normalizeTicker(entity.name))
    ));
}

function getNamedEntities(item, types) {
  return (item?.entities || [])
    .filter((entity) => types.includes(entity?.type) && normalizeText(entity?.name))
    .map((entity) => normalizeText(entity.name));
}

function sortByStrength(items) {
  return [...items].sort((left, right) => {
    if (right.signal_strength !== left.signal_strength) {
      return right.signal_strength - left.signal_strength;
    }
    if (right.article_count !== left.article_count) {
      return right.article_count - left.article_count;
    }
    return left.label.localeCompare(right.label);
  });
}

export function buildTickerSignalGroups(newsItems) {
  const groups = new Map();

  for (const item of newsItems || []) {
    if (!isArticleAnalyzed(item)) continue;

    const tickers = new Map();
    for (const entity of getTickerEntities(item)) {
      tickers.set(entity.ticker, entity);
    }

    const score = Number(item.sentiment_score) || 0;
    if (tickers.size === 0 || score === 0) continue;

    for (const entity of tickers.values()) {
      const ticker = entity.ticker;
      const existing = groups.get(ticker) || {
        key: ticker,
        type: "ticker",
        label: ticker,
        ticker,
        article_ids: [],
        article_titles: [],
        article_count: 0,
        bullish_articles: 0,
        bearish_articles: 0,
        total_score: 0,
        absolute_score_total: 0,
        article_weight_total: 0,
        weighted_score_total: 0,
        weighted_abs_score_total: 0,
        bullish_weight_total: 0,
        bearish_weight_total: 0,
        company_names: new Set(),
        topic_tags: new Set(),
      };

      const articleWeight = getArticleSignalWeight(item);

      existing.article_ids.push(item.id);
      existing.article_titles.push(item.title);
      existing.article_count += 1;
      existing.total_score += score;
      existing.absolute_score_total += Math.abs(score);
      existing.article_weight_total += articleWeight;
      existing.weighted_score_total += score * articleWeight;
      existing.weighted_abs_score_total += Math.abs(score) * articleWeight;
      if (score >= 0) existing.bullish_articles += 1;
      if (score < 0) existing.bearish_articles += 1;
      if (score >= 0) existing.bullish_weight_total += articleWeight;
      if (score < 0) existing.bearish_weight_total += articleWeight;
      if (normalizeText(entity.name) && normalizeText(entity.name) !== ticker) {
        existing.company_names.add(normalizeText(entity.name));
      }
      for (const tag of item.sector_tags || []) existing.topic_tags.add(normalizeText(tag));
      for (const tag of item.macro_signals || []) existing.topic_tags.add(normalizeText(tag));

      groups.set(ticker, existing);
    }
  }

  return sortByStrength(
    [...groups.values()].map((group) => {
      const averageScore = group.article_count ? group.total_score / group.article_count : 0;
      const weightedAverageScore = group.article_weight_total
        ? group.weighted_score_total / group.article_weight_total
        : averageScore;
      const directionalAgreement = getDirectionalAgreement(group.bullish_weight_total, group.bearish_weight_total);
      const convictionScore = getConvictionScore(weightedAverageScore, directionalAgreement, group.article_count);
      return {
        ...group,
        company_names: [...group.company_names],
        topic_tags: [...group.topic_tags].filter(Boolean),
        average_score: averageScore,
        weighted_average_score: weightedAverageScore,
        directional_agreement: Number(directionalAgreement.toFixed(4)),
        conviction_score: Number(convictionScore.toFixed(4)),
        sentiment: weightedAverageScore >= 0 ? "bullish" : "bearish",
        signal_strength: Math.abs(weightedAverageScore),
      };
    })
  );
}

function addTopicToGroup(groups, item, topicType, label, extra = {}) {
  const normalizedLabel = normalizeText(label);
  const key = `${topicType}:${normalizeKey(normalizedLabel)}`;
  if (!normalizedLabel || normalizedLabel.length < 2) return;

  const score = Number(item.sentiment_score) || 0;
  const existing = groups.get(key) || {
    key,
    type: "topic",
    topic_type: topicType,
    label: normalizedLabel,
    article_ids: [],
    article_titles: [],
    article_count: 0,
    total_score: 0,
    absolute_score_total: 0,
    bullish_articles: 0,
    bearish_articles: 0,
    related_tickers: new Set(),
    related_entities: new Set(),
    ...extra,
  };

  existing.article_ids.push(item.id);
  existing.article_titles.push(item.title);
  existing.article_count += 1;
  existing.total_score += score;
  existing.absolute_score_total += Math.abs(score);
  if (score >= 0) existing.bullish_articles += 1;
  if (score < 0) existing.bearish_articles += 1;
  for (const entity of item.entities || []) {
    const ticker = normalizeTicker(entity?.ticker || entity?.name);
    if (entity?.type === "ticker" && ticker) existing.related_tickers.add(ticker);
    if (normalizeText(entity?.name)) existing.related_entities.add(normalizeText(entity.name));
  }

  groups.set(key, existing);
}

export function buildTopicSignalGroups(newsItems) {
  const groups = new Map();

  for (const item of newsItems || []) {
    if (!isArticleAnalyzed(item)) continue;

    for (const sector of item.sector_tags || []) {
      addTopicToGroup(groups, item, "sector", sector);
    }

    for (const macro of item.macro_signals || []) {
      addTopicToGroup(groups, item, "macro", macro);
    }

    for (const company of getNamedEntities(item, ["company", "sector", "macro"])) {
      addTopicToGroup(groups, item, "entity", company);
    }
  }

  return sortByStrength(
    [...groups.values()]
      .filter((group) => group.article_count >= 2)
      .map((group) => {
        const averageScore = group.article_count ? group.total_score / group.article_count : 0;
        return {
          ...group,
          average_score: averageScore,
          sentiment: averageScore >= 0 ? "bullish" : "bearish",
          signal_strength: Math.abs(averageScore),
          related_tickers: [...group.related_tickers],
          related_entities: [...group.related_entities],
        };
      })
  );
}

export function buildHypothesisGroupOptions(newsItems) {
  const tickerGroups = buildTickerSignalGroups(newsItems).map((group) => ({
    ...group,
    group_kind: "ticker",
  }));
  const topicGroups = buildTopicSignalGroups(newsItems).map((group) => ({
    ...group,
    group_kind: "topic",
  }));
  return [...tickerGroups, ...topicGroups].sort((left, right) => {
    if ((right.conviction_score || 0) !== (left.conviction_score || 0)) {
      return (right.conviction_score || 0) - (left.conviction_score || 0);
    }
    if (right.signal_strength !== left.signal_strength) {
      return right.signal_strength - left.signal_strength;
    }
    return right.article_count - left.article_count;
  });
}

export function buildSignalDrivenHoldings(newsItems, budget, options = {}) {
  const maxPositions = Number.isFinite(options.maxPositions) ? options.maxPositions : 8;
  const minSignalStrength = Number.isFinite(options.minSignalStrength) ? options.minSignalStrength : 0.2;
  const usableBudget = Number(budget) || 0;
  if (usableBudget <= 0) return [];

  const candidates = buildTickerSignalGroups(newsItems)
    .filter((group) => group.signal_strength >= minSignalStrength)
    .slice(0, maxPositions);

  // Weight by aggregate per-article signal impact so each analyzed item contributes.
  const totalWeight = candidates.reduce((sum, group) => {
    const baseImpact = Number(group.weighted_abs_score_total) || Number(group.absolute_score_total) || Number(group.signal_strength) || 0;
    const convictionMultiplier = 0.5 + clamp01(group.conviction_score ?? group.signal_strength ?? 0);
    const impactWeight = baseImpact * convictionMultiplier;
    return sum + impactWeight;
  }, 0);
  if (!totalWeight) return [];

  const analyzedItemsCount = (newsItems || []).filter(isArticleAnalyzed).length;

  return candidates.map((group) => {
    const baseImpact = Number(group.weighted_abs_score_total) || Number(group.absolute_score_total) || Number(group.signal_strength) || 0;
    const convictionMultiplier = 0.5 + clamp01(group.conviction_score ?? group.signal_strength ?? 0);
    const impactWeight = baseImpact * convictionMultiplier;
    const weight = impactWeight / totalWeight;
    const allocationAmount = usableBudget * weight;
    return {
      ticker: group.ticker,
      name: group.company_names[0] || group.label,
      sector: group.topic_tags[0] || "News-derived",
      allocation_pct: Number((weight * 100).toFixed(2)),
      allocation_amount: Number(allocationAmount.toFixed(2)),
      position_type: group.weighted_average_score >= 0 ? "long" : "short",
      signal_score: Number(group.weighted_average_score.toFixed(4)),
      signal_strength: Number(group.signal_strength.toFixed(4)),
      conviction_score: Number((group.conviction_score || 0).toFixed(4)),
      directional_agreement: Number((group.directional_agreement || 0).toFixed(4)),
      signal_weight_total: Number(impactWeight.toFixed(4)),
      article_count: group.article_count,
      analyzed_items_count: analyzedItemsCount,
      supporting_news_ids: group.article_ids,
      supporting_news_titles: group.article_titles,
    };
  });
}

export function describeSignalDirection(score) {
  return Number(score) >= 0 ? "bullish" : "bearish";
}

export function formatSignalPercent(score) {
  return `${Math.round(getSignalStrength(score) * 100)}%`;
}