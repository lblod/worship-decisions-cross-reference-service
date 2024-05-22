import { sparqlEscapeUri, sparqlEscapeString } from 'mu';

export function isInverse(predicate) {
  return predicate && predicate.startsWith('^');
}

export function sparqlEscapePredicate(predicate) {
  return isInverse(predicate) ? `^<${predicate.slice(1)}>` : `<${predicate}>`;
}

export function normalizePredicate(predicate) {
  return isInverse(predicate) ? predicate.slice(1) : predicate;
}

export function serializeTriple(triple) {
  const predicate = sparqlEscapePredicate(triple.p.value);
  return `${serializeTriplePart(triple.s)} ${predicate} ${serializeTriplePart(triple.o)}.`;
}

export function serializeTriplePart(triplePart){
  if(triplePart.type == 'uri' || triplePart.termType == "NamedNode"){
    return sparqlEscapeUri(triplePart.value);
  }
  else if (triplePart.type === 'literal' || triplePart.type === 'typed-literal') {
    if(triplePart.datatype) {
        // Cast to string, because subtle serialization issues from virtuoso: json -> SELECT vs CONSTRUCT returns different ints formats
        return `${sparqlEscapeString(String(triplePart.value))}^^${sparqlEscapeUri(triplePart.datatype)}`;
    }
    else if(triplePart.lang) {
      return `${sparqlEscapeString(String(triplePart.value))}@${triplePart.lang}`;
    }
    else {
      return sparqlEscapeString(String(triplePart.value));
    }
  }
  else {
    console.log(`Don't know how to escape type ${triplePart.type}. Will escape as a string.`);
    return sparqlEscapeString(triplePart.value);
  }
}
