// CanvasCore admin UI kit: the building blocks every screen uses, so buttons, fields, cards,
// tabs and headers look and behave the same everywhere (styles in kit.css, classes "ui-*").
import React, { useState, useId } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { __ } from '../i18n/index.js';

const cx = (...c) => c.filter(Boolean).join(' ');

export function Button({ variant = 'secondary', size, block, icon: Icon, iconOnly, className, children, type = 'button', ...rest }) {
  return (
    <button type={type} className={cx('ui-btn', `ui-btn--${variant}`, size && `ui-btn--${size}`, block && 'ui-btn--block', iconOnly && 'ui-btn--icon', className)} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" />}{children}
    </button>
  );
}

// Icon-only button: the label is required (tooltip + screen readers)
export function IconButton({ icon: Icon, label, variant = 'ghost', size, ...rest }) {
  return <Button variant={variant} size={size} iconOnly title={label} aria-label={label} {...rest}><Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" /></Button>;
}

// Label + control + hint/error. The control gets the id so clicking the label focuses it.
export function Field({ label, hint, error, extra, children, className }) {
  const id = useId();
  const child = React.isValidElement(children) && !children.props.id ? React.cloneElement(children, { id }) : children;
  return (
    <div className={cx('ui-field', className)}>
      {label && <label className="ui-label" htmlFor={React.isValidElement(child) ? child.props.id : undefined}><span>{label}</span>{extra}</label>}
      {child}
      {error ? <p className="ui-error" role="alert">{error}</p> : hint ? <p className="ui-hint">{hint}</p> : null}
    </div>
  );
}

export const Input = React.forwardRef(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('ui-input', className)} {...rest} />;
});
export function Textarea({ className, mono, ...rest }) {
  return <textarea className={cx('ui-textarea', mono && 'ui-textarea--mono', className)} {...rest} />;
}
export function Select({ className, options, children, ...rest }) {
  return (
    <select className={cx('ui-select', className)} {...rest}>
      {options ? options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)) : children}
    </select>
  );
}
export function Checkbox({ label, className, ...rest }) {
  return <label className={cx('ui-check', className)}><input type="checkbox" {...rest} /> {label}</label>;
}
export function SearchInput({ value, onChange, placeholder = __("Search…"), label = __("Search"), ...rest }) {
  return (
    <div className="ui-search">
      <Search size={15} aria-hidden="true" />
      <input type="search" className="ui-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} {...rest} />
    </div>
  );
}

// Segmented control: options = [[value, label, Icon?], ...]
export function Segmented({ value, onChange, options, block, label, size }) {
  return (
    <div className={cx('ui-seg', block && 'ui-seg--block')} role="group" aria-label={label}>
      {options.map(([v, l, Icon, title]) => (
        <button key={String(v)} type="button" className="ui-seg__btn" aria-pressed={value === v} title={title || (typeof l === 'string' ? l : undefined)}
          aria-label={!l && title ? title : undefined} onClick={() => onChange(v)} style={size === 'sm' ? { minHeight: 24 } : undefined}>
          {Icon && <Icon size={14} aria-hidden="true" />}{l}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, icon: Icon, description, actions, children, className, ...rest }) {
  return (
    <section className={cx('ui-card', className)} {...rest}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            {title && <h2 className="ui-card__title">{Icon && <Icon size={16} color="#38bdf8" aria-hidden="true" />}{title}</h2>}
            {description && <p className="ui-card__desc">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {!title && description && <p className="ui-card__desc">{description}</p>}
      {children}
    </section>
  );
}

export function Badge({ tone = 'neutral', icon: Icon, children }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{Icon && <Icon size={11} aria-hidden="true" />}{children}</span>;
}

// Page status → badge (pages and collection items)
export function StatusBadge({ status, isDraftCopy }) {
  if (Number(isDraftCopy) || status === 'modified') return <Badge tone="modified">{__("Modified")}</Badge>;
  if (status === 'published') return <Badge tone="published">{__("Published")}</Badge>;
  return <Badge tone="draft">{__("Draft")}</Badge>;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="ui-empty">
      {Icon && <Icon size={40} color="#475569" aria-hidden="true" />}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ icon: Icon, title, description, actions }) {
  return (
    <header className="ui-page-head">
      <div>
        <h1>{Icon && <Icon size={22} aria-hidden="true" />}{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ui-row">{actions}</div>}
    </header>
  );
}

// Tabs: tabs = [[id, label, Icon?]]
export function Tabs({ value, onChange, tabs, label, idPrefix = 'tab' }) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map(([id, l, Icon]) => (
        <button key={id} type="button" role="tab" id={`${idPrefix}-${id}`} aria-selected={value === id} className="ui-tab" onClick={() => onChange(id)}>
          {Icon && <Icon size={14} aria-hidden="true" />}{l}
        </button>
      ))}
    </div>
  );
}

// Collapsible section (property panel and side panels)
export function Section({ title, icon: Icon, defaultOpen = false, children, actions }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="ui-section" data-open={open}>
      <button type="button" className="ui-section__head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{Icon && <Icon size={15} color="#38bdf8" aria-hidden="true" />}{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{actions}<ChevronDown size={15} className="ui-chev" aria-hidden="true" /></span>
      </button>
      {open && <div className="ui-section__body" id={id}>{children}</div>}
    </div>
  );
}
