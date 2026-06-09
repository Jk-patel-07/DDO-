import React, { useState, useEffect } from 'react';
import './calculator.css';

export default function Calculator() {
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState(null);
  const [operation, setOperation] = useState(null);
  const [equation, setEquation] = useState('');
  const [isReadyForNewInput, setIsReadyForNewInput] = useState(false);

  // Clear everything
  const handleClear = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperation(null);
    setEquation('');
    setIsReadyForNewInput(false);
  };

  // Toggle positive/negative
  const handleToggleSign = () => {
    setDisplay((prev) => {
      if (prev === '0') return '0';
      return prev.startsWith('-') ? prev.slice(1) : '-' + prev;
    });
  };

  // Convert to percentage
  const handlePercentage = () => {
    setDisplay((prev) => {
      const val = parseFloat(prev);
      if (isNaN(val)) return '0';
      return (val / 100).toString();
    });
  };

  // Handle number click
  const handleNumber = (num) => {
    if (display === '0' || isReadyForNewInput) {
      setDisplay(num);
      setIsReadyForNewInput(false);
    } else {
      setDisplay(display + num);
    }
  };

  // Handle decimal dot click
  const handleDecimal = () => {
    if (isReadyForNewInput) {
      setDisplay('0.');
      setIsReadyForNewInput(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  // Handle operators (+, -, *, /)
  const handleOperator = (op) => {
    const currentValue = parseFloat(display);
    
    if (prevValue === null) {
      setPrevValue(currentValue);
      setEquation(`${currentValue} ${op}`);
    } else if (operation && !isReadyForNewInput) {
      const result = calculate(prevValue, currentValue, operation);
      setPrevValue(result);
      setDisplay(result.toString());
      setEquation(`${result} ${op}`);
    } else {
      // Operator changed without a new number input
      setEquation(`${prevValue} ${op}`);
    }
    
    setOperation(op);
    setIsReadyForNewInput(true);
  };

  // Calculate helper
  const calculate = (a, b, op) => {
    let res = 0;
    switch (op) {
      case '+': res = a + b; break;
      case '-': res = a - b; break;
      case '×': res = a * b; break;
      case '÷': 
        if (b === 0) return 'Error';
        res = a / b; 
        break;
      default: return b;
    }
    // Round to avoid precision issues like 0.1 + 0.2 = 0.30000000000000004
    return Math.round(res * 100000000) / 100000000;
  };

  // Handle equal click
  const handleEqual = () => {
    if (prevValue === null || operation === null) return;
    
    const currentValue = parseFloat(display);
    const result = calculate(prevValue, currentValue, operation);
    
    setDisplay(result.toString());
    setEquation('');
    setPrevValue(null);
    setOperation(null);
    setIsReadyForNewInput(true);
  };

  // Map keyboard keys to calculator actions
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key;
      
      if (/[0-9]/.test(key)) {
        handleNumber(key);
      } else if (key === '.') {
        handleDecimal();
      } else if (key === '+' || key === '-') {
        handleOperator(key);
      } else if (key === '*') {
        handleOperator('×');
      } else if (key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        handleEqual();
      } else if (key === 'Escape' || key === 'c' || key === 'C') {
        handleClear();
      } else if (key === '%') {
        handlePercentage();
      } else if (key === 'Backspace') {
        setDisplay(prev => {
          if (prev.length <= 1 || prev === 'Error') return '0';
          return prev.slice(0, -1);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [display, prevValue, operation, isReadyForNewInput]);

  return (
    <div className="mac-calc-container">
      <div className="mac-calc-screen">
        <div className="mac-calc-equation">{equation}</div>
        <div className="mac-calc-display" title={display}>
          {display.length > 9 ? parseFloat(display).toPrecision(7) : display}
        </div>
      </div>
      <div className="mac-calc-buttons">
        <button className="calc-btn utility" onClick={handleClear}>
          {display !== '0' ? 'C' : 'AC'}
        </button>
        <button className="calc-btn utility" onClick={handleToggleSign}>±</button>
        <button className="calc-btn utility" onClick={handlePercentage}>%</button>
        <button className={`calc-btn operator ${operation === '÷' ? 'active' : ''}`} onClick={() => handleOperator('÷')}>÷</button>

        <button className="calc-btn digit" onClick={() => handleNumber('7')}>7</button>
        <button className="calc-btn digit" onClick={() => handleNumber('8')}>8</button>
        <button className="calc-btn digit" onClick={() => handleNumber('9')}>9</button>
        <button className={`calc-btn operator ${operation === '×' ? 'active' : ''}`} onClick={() => handleOperator('×')}>×</button>

        <button className="calc-btn digit" onClick={() => handleNumber('4')}>4</button>
        <button className="calc-btn digit" onClick={() => handleNumber('5')}>5</button>
        <button className="calc-btn digit" onClick={() => handleNumber('6')}>6</button>
        <button className={`calc-btn operator ${operation === '-' ? 'active' : ''}`} onClick={() => handleOperator('-')}>-</button>

        <button className="calc-btn digit" onClick={() => handleNumber('1')}>1</button>
        <button className="calc-btn digit" onClick={() => handleNumber('2')}>2</button>
        <button className="calc-btn digit" onClick={() => handleNumber('3')}>3</button>
        <button className={`calc-btn operator ${operation === '+' ? 'active' : ''}`} onClick={() => handleOperator('+')}>+</button>

        <button className="calc-btn digit zero" onClick={() => handleNumber('0')}>0</button>
        <button className="calc-btn digit" onClick={handleDecimal}>.</button>
        <button className="calc-btn operator equal" onClick={handleEqual}>=</button>
      </div>
    </div>
  );
}
