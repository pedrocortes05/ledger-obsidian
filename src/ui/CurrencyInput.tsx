import { Values } from './EditTransaction';
import { FieldProps } from 'formik';
import React from 'react';
import styled from 'styled-components';

const InputWithIconWrapper = styled.div`
  position: relative;
`;

const InputWithIcon = styled.input`
  /* important required to override mobile stylesheet */
  padding-left: 65px !important;
  width: 100%;
`;

const InputIcon = styled.i`
  position: absolute;
  display: block;
  transform: translate(0, -50%);
  top: 50%;
  pointer-events: none;
  width: 25px;
  text-align: center;
  font-style: normal;
`;

const InputSelect = styled.div`
  position: absolute;
  display: flex; /* Allows for flexible content like a dropdown */
  align-items: center;
  justify-content: center;
  transform: translate(0, -50%);
  top: 50%;
  pointer-events: auto; /* Allows interaction with dropdown */
  width: auto; /* Adjust width based on content */
  height: 100%; /* Ensure it aligns with the input */
`;

const StyledSelect = styled.select`
  background: transparent;
  border: none;
  font-size: 1em;
  cursor: pointer;
  outline: none;
  appearance: none; /* Removes default browser styling */
  padding: 0 5px;
  margin: 0;
  text-align: center;
  box-shadow: none;
`;

export const CurrencyInputFormik: React.FC<
  {
    currencySymbol: string;
    placeholder: string | undefined;
    disabled?: boolean;
    currencyOptions: { label: string; value: string }[]; // Array of dropdown options
    currencyID: string;
  } & FieldProps<string, Values>
> = (props): JSX.Element => (
  <CurrencyInput
    placeholder={props.placeholder || 'Amount'}
    currencyOptions={props.currencyOptions}
    currencySymbol={props.currencySymbol}
    amount={props.field.value}
    setValue={(newValue: string) => {
      props.form.setFieldValue(props.field.name, newValue);
    }}
    setCurrencyType={(currencyType: string) => {
      props.form.setFieldValue(props.currencyID || 'currencyType', currencyType);
    }}
    disabled={props.disabled || false}
  />
);

export const CurrencyInput: React.FC<{
  placeholder: string;
  currencyOptions: { label: string; value: string }[];
  currencySymbol: string;
  amount: string;
  setValue: (newValue: string) => void;
  setCurrencyType: (currencyType: string) => void;
  disabled?: boolean;
}> = ({
  placeholder,
  currencyOptions,
  currencySymbol,
  amount,
  setValue,
  setCurrencyType,
  disabled,
}): JSX.Element => (
  <InputWithIconWrapper>
    <InputWithIcon
      placeholder={placeholder}
      disabled={disabled || false}
      type="number"
      value={amount}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const val = amount.length > 0 ? parseFloat(amount).toFixed(2) : '';
        setValue(val);
      }}
    />
    
    <InputSelect>
      <StyledSelect
        defaultValue={currencyOptions[0]?.value || '$'}
        onChange={(e) => setCurrencyType(e.target.value)}
        disabled={disabled || false}
      >
        {currencyOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </StyledSelect>
    </InputSelect>

    {/* <InputIcon>{currencySymbol}</InputIcon> */}
    {/* AQui arriba va el simbolo de moneda */}
  </InputWithIconWrapper>
);
