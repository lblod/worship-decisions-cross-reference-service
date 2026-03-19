import * as env from 'env-var';

const ENV = {
  BYPASS_HOP_CENTRAAL_BESTUUR: env.get('BYPASS_HOP_CENTRAAL_BESTUUR').default('false').asBool(),
  WORSHIP_DECISIONS_BASE_URL: env.get('WORSHIP_DECISIONS_BASE_URL').default('https://databankerediensten.lokaalbestuur.vlaanderen.be/search/submissions/').asString(),
  SCOPE_SUBMISSIONS_TO_ONE_GRAPH: env.get('SCOPE_SUBMISSIONS_TO_ONE_GRAPH').default('false').asBool(),
  USE_SUDO_QUERIES: env.get('USE_SUDO_QUERIES').default('true').asBool(),
}

export default ENV;