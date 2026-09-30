import { useState } from 'react';
import { createTrade } from '../api.js';
import { TRADE_FIELDS, buildCreatePayload, initialTradeValues, splitIssues } from '../tradeForm.js';

const LABELS = {
  instrumentId: 'Instrument',
  direction: 'Direction',
  status: 'Status',
  quantity: 'Quantity',
  entryPrice: 'Entry price',
  enteredAt: 'Entered at',
  exitPrice: 'Exit price',
  exitedAt: 'Exited at',
  fees: 'Fees',
  notes: 'Notes',
};

const EXIT_FIELDS = ['exitPrice', 'exitedAt'];

// Records a new trade. The server checks every rule and computes the P&L; this form only
// collects the values, sends them and shows what the server said about them.
export default function AddTradeForm({ instruments, onCreated, onCancel }) {
  const [values, setValues] = useState(() => initialTradeValues());
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  // Problems not tied to a visible field, and failures that aren't validation errors.
  const [generalErrors, setGeneralErrors] = useState([]);
  const [failure, setFailure] = useState(null);

  const closed = values.status === 'CLOSED';
  const visibleFields = closed
    ? TRADE_FIELDS
    : TRADE_FIELDS.filter((field) => !EXIT_FIELDS.includes(field));

  function update(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;

    setGeneralErrors([]);
    setFailure(null);

    const { payload, errors } = buildCreatePayload(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      await createTrade(payload);
    } catch (error) {
      if (error.issues) {
        const split = splitIssues(error.issues, visibleFields);
        setFieldErrors(split.fieldErrors);
        setGeneralErrors(split.generalErrors);
      } else {
        setFailure(error.message);
      }
      setSubmitting(false);
      return;
    }
    onCreated();
  }

  // The props that tie an input to its label and to its error message, if it has one.
  function fieldProps(field) {
    const hasError = fieldErrors[field] !== undefined;
    return {
      id: `trade-${field}`,
      name: field,
      value: values[field],
      onChange: update,
      'aria-invalid': hasError || undefined,
      'aria-describedby': hasError ? `trade-${field}-error` : undefined,
    };
  }

  function error(field) {
    return <FieldError field={field} messages={fieldErrors[field]} />;
  }

  return (
    <section className="panel" aria-labelledby="add-trade-heading">
      <h2 id="add-trade-heading">Add trade</h2>
      <form className="trade-form" onSubmit={submit} noValidate>
        {(failure || generalErrors.length > 0) && (
          <div className="message message-error" role="alert">
            <p>
              <strong>Could not save the trade.</strong> {failure}
            </p>
            {generalErrors.length > 0 && (
              <ul>
                {generalErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <fieldset className="trade-form-fields" disabled={submitting}>
          <div className="field">
            <label htmlFor="trade-instrumentId">Instrument</label>
            {/* The form opens on demand, so its first field takes focus. */}
            <select {...fieldProps('instrumentId')} autoFocus>
              <option value="">Choose…</option>
              {instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.symbol} — {instrument.name}
                </option>
              ))}
            </select>
            {error('instrumentId')}
          </div>

          <div className="field">
            <label htmlFor="trade-direction">Direction</label>
            <select {...fieldProps('direction')}>
              <option value="">Choose…</option>
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
            {error('direction')}
          </div>

          <fieldset
            className="field field-status"
            aria-describedby={fieldErrors.status ? 'trade-status-error' : undefined}
          >
            <legend>Status</legend>
            {['OPEN', 'CLOSED'].map((status) => (
              <label key={status} className="radio">
                <input
                  type="radio"
                  name="status"
                  value={status}
                  checked={values.status === status}
                  onChange={update}
                />
                {status}
              </label>
            ))}
            {error('status')}
          </fieldset>

          <div className="field">
            <label htmlFor="trade-quantity">Quantity</label>
            <input type="text" inputMode="numeric" {...fieldProps('quantity')} />
            {error('quantity')}
          </div>

          <div className="field">
            <label htmlFor="trade-entryPrice">Entry price</label>
            <input type="text" inputMode="decimal" {...fieldProps('entryPrice')} />
            {error('entryPrice')}
          </div>

          <div className="field">
            <label htmlFor="trade-enteredAt">Entered at</label>
            <input type="datetime-local" {...fieldProps('enteredAt')} />
            {error('enteredAt')}
          </div>

          {/* Only a CLOSED trade has an exit. Values typed here are kept if the status is
              switched back to OPEN, but they are only sent for a CLOSED trade. */}
          {closed && (
            <>
              <div className="field">
                <label htmlFor="trade-exitPrice">Exit price</label>
                <input type="text" inputMode="decimal" {...fieldProps('exitPrice')} />
                {error('exitPrice')}
              </div>

              <div className="field">
                <label htmlFor="trade-exitedAt">Exited at</label>
                <input type="datetime-local" {...fieldProps('exitedAt')} />
                {error('exitedAt')}
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="trade-fees">Fees (USD, whole trade)</label>
            <input type="text" inputMode="decimal" {...fieldProps('fees')} />
            {error('fees')}
          </div>

          <div className="field field-wide">
            <label htmlFor="trade-notes">Notes</label>
            <textarea rows={3} {...fieldProps('notes')} />
            {error('notes')}
          </div>

          <div className="form-actions">
            <button type="submit" className="button-primary">
              {submitting ? 'Saving…' : 'Save trade'}
            </button>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

// Server messages read as the end of a sentence ("must be greater than 0"), so they follow
// the field's label. A message that starts with a capital letter is shown as sent.
function FieldError({ field, messages }) {
  if (!messages) return null;
  return (
    <p className="field-error" id={`trade-${field}-error`}>
      {messages
        .map((message) => (/^[a-z]/.test(message) ? `${LABELS[field]} ${message}` : message))
        .join('. ')}
    </p>
  );
}
