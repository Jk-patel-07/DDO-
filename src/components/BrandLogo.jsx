const BrandLogo = ({
  className = '',
  alt = 'DDO horse logo',
}) => (
  <img
    src="/ddo-horse-icon.svg"
    alt={alt}
    className={`ddo-brand-logo ${className}`.trim()}
    draggable="false"
  />
);

export default BrandLogo;
