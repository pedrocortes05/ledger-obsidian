import { LedgerModifier } from '../file-interface';
import {
  accountSuggestions,
  autofillFromPayee,
  balancingAmount,
  buildTransactionText,
  commodityOptions,
  FormContext,
  initialValues,
  Line,
  lineLabel,
  linesAreUntouched,
  makeLine,
  makeMetaRow,
  metadataValueSuggestions,
  MetaRow,
  minDecimalsFor,
  seedFirstLine,
  validateValues,
  ValueErrors,
  Values,
} from '../form-logic';
import { Operation } from '../modals';
import { EnhancedTransaction, TransactionCache } from '../parser';
import { TransactionPrefill } from '../prefill';
import { ISettings } from '../settings';
import { TxType } from '../transaction-utils';
import { CurrencyInput } from './CurrencyInput';
import { TextSuggest } from './TextSuggest';
import React from 'react';
import styled from 'styled-components';

const FormStyles = styled.div`
  .ledger-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 6px 0;
  }

  .ledger-grow {
    flex: 1 1 0;
    min-width: 0;
  }

  input[type='text'],
  input[type='date'] {
    width: 100%;
  }

  .ledger-button-group {
    display: flex;
    margin: 6px 0 12px;
  }

  .ledger-button-group button {
    flex: 1 1 0;
    margin: 0;
    border-radius: 0;
  }

  .ledger-button-group button:first-child {
    border-radius: 4px 0 0 4px;
  }

  .ledger-button-group button:last-child {
    border-radius: 0 4px 4px 0;
  }

  .ledger-error {
    color: var(--text-error);
    font-size: var(--font-ui-small);
    margin: 2px 0 6px;
  }

  .ledger-hint {
    color: var(--text-muted);
    font-size: var(--font-ui-small);
    margin: 2px 0 6px;
  }

  .ledger-line {
    border-bottom: 1px solid var(--background-modifier-border);
    padding: 4px 0;
  }

  .ledger-line-label {
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
  }

  .ledger-icon-button {
    background: none;
    box-shadow: none;
    padding: 4px 6px;
    color: var(--text-muted);
  }

  .ledger-amount {
    flex: 0 1 45%;
  }

  .ledger-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 12px;
  }

  .ledger-metadata {
    margin: 8px 0;
  }

  .ledger-meta-key {
    flex: 0 1 38%;
    min-width: 0;
  }

  .ledger-next-value {
    flex: 0 0 auto;
    margin: 0;
    white-space: nowrap;
  }

  .ledger-add-metadata {
    margin-top: 4px;
  }

  .ledger-warning {
    background: var(--background-modifier-error);
    padding: 10px 15px;
    border-radius: 4px;
  }
`;

const typeOptions: [TxType, string][] = [
  ['expense', 'Expense'],
  ['income', 'Income'],
  ['transfer', 'Transfer'],
];

const ExpenseLine: React.FC<{
  index: number;
  values: Values;
  txCache: TransactionCache;
  commodities: string[];
  canRemove: boolean;
  update: (index: number, changes: Partial<Line>) => void;
  remove: (index: number) => void;
}> = (props): JSX.Element => {
  const line = props.values.lines[props.index];
  const [showMemo, setShowMemo] = React.useState(line.comment !== '');
  const suggestions = React.useMemo(
    () => accountSuggestions(props.values, props.index, props.txCache),
    [
      props.values.txType,
      props.values.lines.length,
      line.virtual,
      props.index,
      props.txCache,
    ],
  );
  const placeholder =
    balancingAmount(props.values, props.index, props.txCache) ?? 'Amount';

  return (
    <div className="ledger-line">
      <div className="ledger-line-label">
        {lineLabel(props.values, props.index)}
      </div>
      <div className="ledger-row">
        <div className="ledger-grow">
          <TextSuggest
            value={line.account}
            onChange={(account) => props.update(props.index, { account })}
            suggestions={suggestions}
            placeholder={line.virtual ? 'Budget:Trip' : 'Account'}
          />
        </div>
        <CurrencyInput
          className="ledger-amount"
          amount={line.amount}
          currency={line.currency}
          commodities={props.commodities}
          placeholder={placeholder}
          minDecimals={(currency) => minDecimalsFor(props.txCache, currency)}
          onAmountChange={(amount) => props.update(props.index, { amount })}
          onCurrencyChange={(currency) =>
            props.update(props.index, { currency })
          }
        />
        <button
          type="button"
          className="ledger-icon-button"
          aria-label="Add memo"
          title="Memo"
          onClick={() => setShowMemo(!showMemo)}
        >
          ✎
        </button>
        {props.canRemove ? (
          <button
            type="button"
            className="ledger-icon-button"
            aria-label="Remove line"
            title="Remove line"
            onClick={() => props.remove(props.index)}
          >
            ✕
          </button>
        ) : null}
      </div>
      {showMemo ? (
        <div className="ledger-row">
          <input
            type="text"
            placeholder="Memo"
            value={line.comment}
            onChange={(e) =>
              props.update(props.index, { comment: e.target.value })
            }
          />
        </div>
      ) : null}
    </div>
  );
};

const MetadataRowFields: React.FC<{
  row: MetaRow;
  txCache: TransactionCache;
  update: (changes: Partial<MetaRow>) => void;
  remove: () => void;
}> = ({ row, txCache, update, remove }): JSX.Element => {
  const { next, values } = React.useMemo(
    () => metadataValueSuggestions(txCache, row.key.trim()),
    [txCache, row.key],
  );
  return (
    <div className="ledger-row ledger-meta-row">
      <div className="ledger-meta-key">
        <TextSuggest
          value={row.key}
          onChange={(key) => update({ key })}
          suggestions={txCache.metadataKeys}
          placeholder="Name, e.g. Edition"
        />
      </div>
      <div className="ledger-grow">
        <TextSuggest
          value={row.value}
          onChange={(value) => update({ value })}
          suggestions={values}
          placeholder={row.needsValue ? 'Value' : 'Value (empty for a tag)'}
        />
      </div>
      {next && row.value.trim() === '' ? (
        <button
          type="button"
          className="ledger-next-value"
          title={`Use the next ${row.key}`}
          onClick={() => update({ value: next })}
        >
          Next: {next}
        </button>
      ) : null}
      <button
        type="button"
        className="ledger-icon-button"
        aria-label="Remove field"
        title="Remove"
        onClick={remove}
      >
        ✕
      </button>
    </div>
  );
};

const titles: Record<Operation, string> = {
  new: 'Add to Ledger',
  clone: 'Copy transaction',
  modify: 'Edit transaction',
};

export const EditTransaction: React.FC<{
  displayFileWarning: boolean;
  settings: ISettings;
  initialState: EnhancedTransaction;
  operation: Operation;
  prefill?: TransactionPrefill;
  updater: LedgerModifier;
  txCache: TransactionCache;
  close: () => void;
}> = (props): JSX.Element => {
  const ctx: FormContext = React.useMemo(
    () => ({
      operation: props.operation,
      settings: props.settings,
      txCache: props.txCache,
      initialState: props.initialState,
    }),
    [props.operation, props.settings, props.txCache, props.initialState],
  );
  const initial = React.useMemo(() => initialValues(ctx, props.prefill), [ctx]);
  const [values, setValues] = React.useState<Values>(initial.values);
  const [errors, setErrors] = React.useState<ValueErrors>({});
  const [page, setPage] = React.useState(1);
  const [submitting, setSubmitting] = React.useState(false);
  const [autofillSource, setAutofillSource] = React.useState<string | null>(
    null,
  );
  const seed = React.useRef<string | undefined>(
    initial.values.lines[0]?.amount === initial.values.total
      ? initial.values.total
      : undefined,
  );
  const currencyChosen = React.useRef(!!props.prefill?.currency);
  const commodities = React.useMemo(
    () => commodityOptions(props.settings, props.txCache),
    [props.settings, props.txCache],
  );
  const payeeSuggestions = props.txCache.payees;

  const set = (changes: Partial<Values>): void =>
    setValues((current) => ({ ...current, ...changes }));

  const updateLine = (index: number, changes: Partial<Line>): void =>
    setValues((current) => ({
      ...current,
      lines: current.lines.map((line, i) =>
        i === index ? { ...line, ...changes } : line,
      ),
    }));

  const removeLine = (index: number): void =>
    setValues((current) => ({
      ...current,
      lines: current.lines.filter((_, i) => i !== index),
    }));

  const addLine = (virtual: boolean): void =>
    setValues((current) => {
      const line = makeLine({
        currency: current.currency,
        virtual: virtual ? '(' : '',
      });
      const lines = [...current.lines];
      // New splits go before the paying account; budget lines go at the end
      // of the real postings, like the existing file.
      lines.splice(Math.max(lines.length - 1, 0), 0, line);
      return { ...current, lines };
    });

  const handlePayeeSelected = (payee: string): void => {
    if (props.operation !== 'new' || !linesAreUntouched(values)) {
      return;
    }
    // Never overwrite a total or commodity the user already chose.
    const result = autofillFromPayee(values, payee, ctx, {
      total: values.total.trim() !== '',
      currency: currencyChosen.current,
    });
    if (result) {
      // The copied first line holds the previous total; mark it as seeded so
      // Next replaces it with the total typed now.
      seed.current =
        result.values.lines[0]?.amount === result.sourceTotal
          ? result.sourceTotal
          : undefined;
      setValues(result.values);
      setAutofillSource(result.source.value.date);
    }
  };

  const goToLines = (): void => {
    const pageErrors = validateValues(values, ctx);
    const relevant: ValueErrors = {
      date: pageErrors.date,
      payee: pageErrors.payee,
      total: pageErrors.total,
      metadata: pageErrors.metadata,
    };
    setErrors(relevant);
    if (
      relevant.date ||
      relevant.payee ||
      relevant.total ||
      relevant.metadata
    ) {
      return;
    }
    const seeded = seedFirstLine(values, seed.current);
    if (seeded !== values) {
      seed.current = values.total;
    }
    setValues(seeded);
    setPage(2);
  };

  const submit = async (): Promise<void> => {
    const allErrors = validateValues(values, ctx);
    setErrors(allErrors);
    if (Object.values(allErrors).some((e) => e)) {
      if (
        allErrors.date ||
        allErrors.payee ||
        allErrors.total ||
        allErrors.metadata
      ) {
        setPage(1);
      }
      return;
    }
    setSubmitting(true);
    const text = buildTransactionText(values, ctx, initial.leadingComments);
    const ok =
      props.operation === 'modify'
        ? await props.updater.updateTransaction(props.initialState, text)
        : await props.updater.addTransaction(text, values.date);
    setSubmitting(false);
    if (ok) {
      props.close();
    }
  };

  const realLineCount = values.lines.filter(
    (line) => line.virtual === '',
  ).length;

  return (
    <FormStyles>
      <h2>{titles[props.operation]}</h2>

      {props.displayFileWarning ? (
        <div className="ledger-warning">
          Please rename your ledger file to end with the .ledger extension. Once
          renamed, please update the configuration option in the Ledger plugin
          settings.
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (page === 1) {
            goToLines();
          } else {
            submit();
          }
        }}
      >
        {page === 1 ? (
          <>
            <div className="ledger-button-group" role="group">
              {typeOptions.map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  className={values.txType === type ? 'mod-cta' : ''}
                  onClick={() => set({ txType: type })}
                >
                  {label}
                </button>
              ))}
            </div>

            {values.txType !== 'transfer' ? (
              <>
                <TextSuggest
                  value={values.payee}
                  onChange={(payee) => set({ payee })}
                  onSelect={handlePayeeSelected}
                  suggestions={payeeSuggestions}
                  placeholder="Payee (e.g. Obsidian.md)"
                />
                {errors.payee ? (
                  <div className="ledger-error">{errors.payee}</div>
                ) : null}
                {autofillSource ? (
                  <div className="ledger-hint">
                    Filled in from the {autofillSource} transaction.{' '}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setValues(initial.values);
                        setAutofillSource(null);
                        seed.current = undefined;
                      }}
                    >
                      Clear
                    </a>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="ledger-row">
              <div className="ledger-grow">
                <CurrencyInput
                  amount={values.total}
                  currency={values.currency}
                  commodities={commodities}
                  placeholder="Total amount"
                  minDecimals={(currency) =>
                    minDecimalsFor(props.txCache, currency)
                  }
                  onAmountChange={(total) => set({ total })}
                  onCurrencyChange={(currency) => {
                    currencyChosen.current = true;
                    set({ currency });
                  }}
                />
              </div>
              <div className="ledger-grow">
                <input
                  type="date"
                  value={values.date}
                  onChange={(e) => set({ date: e.target.value })}
                />
              </div>
            </div>
            {errors.total ? (
              <div className="ledger-error">{errors.total}</div>
            ) : null}
            {errors.date ? (
              <div className="ledger-error">{errors.date}</div>
            ) : null}

            <div className="ledger-metadata">
              {values.metadata.length > 0 ? (
                <div className="ledger-line-label">Tags & metadata</div>
              ) : null}
              {values.metadata.map((row) => (
                <MetadataRowFields
                  key={row.id}
                  row={row}
                  txCache={props.txCache}
                  update={(changes) =>
                    set({
                      metadata: values.metadata.map((r) =>
                        r.id === row.id ? { ...r, ...changes } : r,
                      ),
                    })
                  }
                  remove={() =>
                    set({
                      metadata: values.metadata.filter((r) => r.id !== row.id),
                    })
                  }
                />
              ))}
              {errors.metadata ? (
                <div className="ledger-error">{errors.metadata}</div>
              ) : null}
              <button
                type="button"
                className="ledger-add-metadata"
                onClick={() =>
                  set({ metadata: [...values.metadata, makeMetaRow()] })
                }
              >
                + Tag or metadata
              </button>
            </div>

            <div className="ledger-actions">
              <button type="button" onClick={props.close}>
                Cancel
              </button>
              <button type="submit" className="mod-cta">
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            {values.lines.map((line, i) => (
              <ExpenseLine
                key={line.id}
                index={i}
                values={values}
                txCache={props.txCache}
                commodities={commodities}
                canRemove={line.virtual !== '' || realLineCount > 2}
                update={updateLine}
                remove={removeLine}
              />
            ))}
            {errors.lines ? (
              <div className="ledger-error">{errors.lines}</div>
            ) : null}
            <div className="ledger-hint">
              Leave one amount empty to balance the transaction automatically.
            </div>

            <div className="ledger-actions">
              <button type="button" onClick={() => addLine(false)}>
                Add split
              </button>
              <button type="button" onClick={() => addLine(true)}>
                Add budget line
              </button>
              <button type="button" onClick={() => setPage(1)}>
                Back
              </button>
              <button type="submit" className="mod-cta" disabled={submitting}>
                {props.operation === 'modify' ? 'Save' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </form>
    </FormStyles>
  );
};
