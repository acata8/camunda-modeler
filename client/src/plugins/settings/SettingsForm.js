/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

import React, { useEffect, useMemo } from 'react';

import { Field, FieldArray, Form, useFormikContext, getIn } from 'formik';

import { map, forEach, sortBy, get, isString, isObject } from 'min-dash';

import { Section, TextInput, CheckBox, Select, Radio, Button } from '../../shared/ui';

import Flags from '../../util/Flags';
import { Settings } from '@carbon/icons-react';
import { Edit, TrashCan } from '@carbon/icons-react';


import {
  Accordion,
  CodeSnippet,
  AccordionItem,

  DataTable,
  ModalWrapper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableExpandHeader,
  TableExpandRow,
  TableExpandedRow,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tab,
  Button as CarbonButton

} from '@carbon/react';


/**
 * Formik form wrapper for the settings form.
 */
export function SettingsForm(props) {

  const { schema, values } = props;

  const { setFieldValue, dirty, values: formikValues, submitForm } = useFormikContext();

  useEffect(() => {
    dirty && submitForm();
  }, [ formikValues ]);

  useEffect(() => {
    forEach(values, (value, key) => {
      setFieldValue(key, value);
    });
  }, [ values ]);

  const orderedSchema = useMemo(() => {
    if (!schema) return {};

    return sortSchemaByOrder(schema);
  }, [ schema, values ]);

  return (<Form>
    {
      map(orderedSchema, (value, key) =>
        <SettingsSection key={ key } { ...value } />)
    }
  </Form>);
}

function SettingsSection(props) {
  const { title, properties } = props;

  return (
    <Section>
      <Section.Header>{ title }</Section.Header>
      <Section.Body>
        {
          map(properties, (props, key) =>
            <SettingsField key={ key } name={ key } { ...props } />)
        }
      </Section.Body>
    </Section>
  );
}

function SettingsField(props) {

  const { type, flag, condition, constraints } = props;

  const { values } = useFormikContext();

  if (condition) {
    const met = isConditionMet(props.name, values, condition);
    if (!met) {
      return null;
    }
  }

  if (type === 'array') {
    return <SettingsFieldArray { ...props } />;
  }

  const flagValue = useMemo(() => {
    return Flags.get(flag);
  }, [ flag ]);

  const component = useMemo(() => {
    if (type === 'text') {
      return TextInput;
    }

    if (type === 'password') {
      return function PasswordInput(props) {
        return <TextInput { ...props } type="password" />;
      };
    }


    if (type === 'boolean') {
      return CheckBox;
    }

    if (type === 'select') {
      return Select;
    }

    if (type === 'radio') {
      return Radio;
    }

    return null;
  }, [ type ]);

  if (!component) {
    return null;
  }

  const { name, label, description, options, documentationUrl } = props;

  const typeProp = type === 'boolean' ? { type: 'checkbox' } : {};

  const disabledByFlag = flagValue !== undefined;


  let validate;
  if (constraints) {
    validate = validator(constraints, label || name);
  }



  return <>
    <Field
      name={ name }
      component={ component }
      { ...typeProp }
      disabled={ disabledByFlag }
      label={ label }
      description={ description }
      options={ options }
      values={ options }
      documentationUrl={ documentationUrl }
      validate={ validate }

      // validate={ (value,something) => {
      //   console.log('validating', { value, props , something });
      //   return 'hello';
      // } }
    />
    { disabledByFlag &&
      <div className="flag-warning">
        This option is overridden by <code>{ flag }</code> flag.&nbsp;
        <a href="https://docs.camunda.io/docs/components/modeler/desktop-modeler/flags/">Learn more.</a>
      </div>
    }
  </>;
}

function validator(constraints, propLabel) {
  return function(value) {
    if (!constraints) return;

    let {
      notEmpty,
      pattern
    } = constraints;


    if (notEmpty && isEmpty(value)) {
      return isString(constraints.notEmpty) ? constraints.notEmpty : `${propLabel || 'This field'} must not be empty`;
    }

    if (pattern) {
      let message = `${propLabel || 'This field'} must match pattern ${pattern}`;
      if (isObject(pattern)) {
        ({ value: pattern, message } = pattern);
      }

      if (!matchesPattern(value, pattern)) {
        return message;
      }
    }

  };
}

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}
function matchesPattern(string, pattern) {
  return new RegExp(pattern).test(string);
}


function SettingsFieldArray(props) {

  const { name, label, description, childProperties, formConfig, validator } = props;
  const { setFieldError } = useFormikContext();
  const arrayValues = getIn(useFormikContext().values, name) || [];

  // Generic validation function for individual array items
  const validateArrayItem = React.useCallback(async (item, index) => {
    if (!item || typeof item !== 'object') return;

    // Clear previous errors for this item
    const fieldKeys = Object.keys(childProperties || {});
    fieldKeys.forEach(key => {
      setFieldError(`${name}[${index}].${key}`, undefined);
    });

    // Basic cross-field validation within the item
    if ((item.name && !item.url) || (!item.name && item.url)) {
      setFieldError(`${name}[${index}].name`, 'Both name and URL must be provided together');
      setFieldError(`${name}[${index}].url`, 'Both name and URL must be provided together');
      return;
    }

    // Skip custom validation if validator function is not provided
    if (!validator || typeof validator !== 'function') {
      return;
    }

    // Check if we have enough data to run validation
    if (!item.name) {
      return; // Don't validate incomplete items
    }

    try {

      // Run the custom validator function
      const validationResult = await validator(item);

      if (validationResult === false) {
        setFieldError(`${name}[${index}].url`, 'Validation failed - please verify your settings');
      } else if (typeof validationResult === 'string') {

        // If validator returns a string, use it as the error message
        setFieldError(`${name}[${index}].url`, validationResult);
      } else if (typeof validationResult === 'object' && validationResult !== null) {

        // If validator returns an object, set field-specific errors
        Object.keys(validationResult).forEach(fieldKey => {
          if (validationResult[fieldKey]) {
            setFieldError(`${name}[${index}].${fieldKey}`, validationResult[fieldKey]);
          }
        });
      } else {

        // Validation successful, clear any previous errors
        setFieldError(`${name}[${index}].url`, undefined);
      }
    } catch (error) {
      setFieldError(`${name}[${index}].url`, `Validation error: ${error.message}`);
    }
  }, [ name, setFieldError, childProperties, validator ]);

  // Track which item is currently being edited
  const [ editingIndex, setEditingIndex ] = React.useState(null);

  // Validate item when specific fields change for the edited item
  // React.useEffect(() => {
  //   if (editingIndex !== null && arrayValues[editingIndex]) {
  //     const debounceTimer = setTimeout(() => {
  //       validateArrayItem(arrayValues[editingIndex], editingIndex);
  //     }, 1000); // Debounce validation by 1 second

  //     return () => clearTimeout(debounceTimer);
  //   }
  // }, [ arrayValues, editingIndex, validateArrayItem ]);

  return <FieldArray name={ name }>
    {(arrayHelpers) => {
      return (
        <div>
          <h3>{ label }</h3>
          { description && <p>{ description }</p> }

          <p style={ {
            fontSize: '13px',
          } }>
            Set up and manage connections to your process automation environments. If you want to work locally have a look at <a href="https://docs.camunda.io/docs/components/modeler/desktop-modeler/flags/">c8run</a>
          </p>

          {arrayValues.length === 0 && (
            <p style={ {
              fontSize: '13px',
            } }>
              {
                formConfig.placeholder
              }
            </p>
          )}

          <DataTable rows={ arrayValues } headers={ [] }>
            {({
              rows,
              headers,
              getHeaderProps,
              getRowProps,
              getExpandedRowProps,
              getTableProps,
              getTableContainerProps,
              expandRow,
            }) => (

              <Table { ...getTableProps() }>

                {/* <TableHead>
                  <TableRow>
                    <TableExpandHeader />
                    <TableHeader>{Object.values(childProperties)[0]?.label}</TableHeader>
                    <TableHeader> */}
                {/* <Tag style={ { float: 'right', padding: '10px' } } type="blue" onClick={ () => arrayHelpers.push({ id: `${values.length + 1}` }) }>
                        + Add
                      </Tag> */}
                {/* </TableHeader>
                  </TableRow>
                </TableHead> */}
                <TableBody style={
                  {
                    backgroundColor: 'white',

                  }
                }>
                  {rows?.map((row, index) => (
                    <React.Fragment key={ `${props.name}[${index}]` }>

                      <TableExpandRow { ...getRowProps({ row }) }>

                        <TableCell>
                          {arrayValues[index]?.name || 'Unnamed'}
                        </TableCell>
                        <TableCell style={ { width: '50px' } }>
                          {/* <Button type="button" onClick={ () => arrayHelpers.remove(index) }>Remove</Button> */}

                          <CarbonButton

                            hasIconOnly
                            iconDescription="Remove"
                            tooltipPosition="left"
                            kind="ghost"
                            onClick={ () =>
                              arrayHelpers.remove(index)
                            }
                            renderIcon={ TrashCan }
                          />

                        </TableCell>

                      </TableExpandRow>
                      <TableExpandedRow
                        { ...getExpandedRowProps({ row }) }
                        colSpan={ 3 }
                        onFocus={ () => setEditingIndex(index) }
                        onBlur={ () => setEditingIndex(null) }
                      >
                        <div
                          onClick={ () => setEditingIndex(index) }
                          onFocus={ () => setEditingIndex(index) }
                        >
                          {
                            map(childProperties, (childProps , key) =>
                            {
                              return (
                                <SettingsField key={ `${name}[${index}].${key}` } name={ `${name}[${index}].${key}` } { ...childProps } />
                              );
                            })
                          }
                        </div>
                      </TableExpandedRow>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </DataTable>
          <button
            style={ {
              marginTop:'6px'
            } }
            className="btn btn-primary"
            type="submit"
            onClick={ () => arrayHelpers.push(formConfig.elementGenerator()) }
          >
            {formConfig.addLabel || 'Add'}
          </button>
        </div>
      );
    }}
  </FieldArray>;
}





// helpers

/**
 * Returns a schema sorted by `order` property.
 *
 * @param {Object} schema
 * @returns {Object} sorted schema
 */
function sortSchemaByOrder(schema) {

  const sortedArray = sortBy(schema, ({ order }) => {
    return order ?? 9999;
  });

  const sortedObj = sortedArray.reduce((acc, obj) => {
    acc[obj.id] = { ...obj };
    return acc;
  }, {});

  return sortedObj;
}


/**
 * Resolves a path relative to the current path or itself
 *
 * @param {string} currentPath
 * @param {string} targetPath - Path to resolve. If it contains a dot, it is considered an absolut path and returned as is.
 * @returns {string} The resolved path
 */
function resolvePath(currentPath, targetPath) {

  if (targetPath.includes('.')) {
    return targetPath;
  }

  const currentSegments = currentPath.split('.');

  currentSegments.pop();

  const resolvedSegments = [ ...currentSegments, targetPath ];
  return resolvedSegments.join('.');
}



function isConditionMet(propName, values,condition) {

  if (condition.allMatch) {
    return condition.allMatch.every((childCondition) => isConditionMet(propName, values, childCondition));
  }

  const conditionPropPath = resolvePath(propName, condition.property);
  const conditionPropValue = getIn(values, conditionPropPath);

  if (condition.equals && conditionPropValue !== condition.equals) {
    return false;
  }

  if (condition.oneOf && !condition.oneOf.includes(conditionPropValue)) {
    return false;
  }


  return true;
}