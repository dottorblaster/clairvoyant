import { type ComponentProps, type ReactNode, useId } from 'react'
import { cx } from '../lib/cx.js'
import { PixelIcon } from './PixelIcon.js'

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: ReactNode
  id?: string
  hint?: ReactNode
  error?: ReactNode
}

export const TextField = ({ label, id, hint, error, className, ...rest }: TextFieldProps) => {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hintId = hint === undefined ? undefined : `${fieldId}-hint`
  const errorId = error === undefined ? undefined : `${fieldId}-error`
  const describedBy = [hintId, errorId].filter((value) => value !== undefined).join(' ')

  return (
    <div className="field">
      <label className="field__label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        {...rest}
        id={fieldId}
        className={cx('input', className)}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy === '' ? undefined : describedBy}
      />
      {hintId === undefined ? null : (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {errorId === undefined ? null : (
        <p className="field__error" id={errorId}>
          <PixelIcon name="alert" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

export interface TextAreaProps extends Omit<ComponentProps<'textarea'>, 'id'> {
  label: ReactNode
  id?: string
  hint?: ReactNode
  error?: ReactNode
}

export const TextArea = ({ label, id, hint, error, className, ...rest }: TextAreaProps) => {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hintId = hint === undefined ? undefined : `${fieldId}-hint`
  const errorId = error === undefined ? undefined : `${fieldId}-error`
  const describedBy = [hintId, errorId].filter((value) => value !== undefined).join(' ')

  return (
    <div className="field">
      <label className="field__label" htmlFor={fieldId}>
        {label}
      </label>
      <textarea
        {...rest}
        id={fieldId}
        className={cx('textarea', className)}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy === '' ? undefined : describedBy}
      />
      {hintId === undefined ? null : (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {errorId === undefined ? null : (
        <p className="field__error" id={errorId}>
          <PixelIcon name="alert" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
