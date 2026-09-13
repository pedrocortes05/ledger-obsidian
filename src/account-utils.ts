/**
 * dealiasAccount replaces an alias used as the whole account name or as its
 * first segment (`e:Food` with `alias e=Expenses` becomes `Expenses:Food`).
 */
export const dealiasAccount = (
  account: string,
  aliases: Map<string, string>,
): string => {
  const firstDelimeter = account.indexOf(':');
  if (firstDelimeter > 0) {
    const prefix = account.substring(0, firstDelimeter);
    if (aliases.has(prefix)) {
      return aliases.get(prefix) + account.substring(firstDelimeter);
    }
  }
  return aliases.get(account) || account;
};

/**
 * isAccountOrChild returns true if `account` is `parent` or one of its
 * sub-accounts. `Assets:Cash` matches `Assets:Cash:Wallet` but not
 * `Assets:Cashback`.
 */
export const isAccountOrChild = (account: string, parent: string): boolean =>
  parent !== '' && (account === parent || account.startsWith(parent + ':'));
