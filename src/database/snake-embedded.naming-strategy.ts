import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/__+/g, '_')
    .toLowerCase();
}

export class SnakeEmbeddedNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    const name = customName ?? propertyName;

    if (embeddedPrefixes.length === 0) {
      return name;
    }

    return [...embeddedPrefixes, name].map(toSnakeCase).join('_');
  }
}
