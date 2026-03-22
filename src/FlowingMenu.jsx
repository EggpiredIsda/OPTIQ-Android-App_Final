import { useRef, useEffect, useState } from 'react';
import { gsap } from 'gsap';

import './FlowingMenu.css';

function FlowingMenu({
  items = [],
  speed = 15,
  textColor = '#fff',
  bgColor = 'transparent',
  marqueeBgColor = '#fff',
  marqueeTextColor = '#060010',
  borderColor = 'rgba(255,255,255,0.08)',
  selectedIndex = -1,
  onItemClick,
}) {
  return (
    <div className="menu-wrap" style={{ backgroundColor: bgColor }}>
      <nav className="menu">
        {items.map((item, idx) => (
          <MenuItem
            key={idx}
            index={idx}
            {...item}
            speed={speed}
            textColor={textColor}
            marqueeBgColor={marqueeBgColor}
            marqueeTextColor={marqueeTextColor}
            borderColor={borderColor}
            selected={selectedIndex === idx}
            onItemClick={onItemClick}
          />
        ))}
      </nav>
    </div>
  );
}

function MenuItem({
  index,
  link,
  text,
  image,
  subtitle,
  price,
  isCustom,
  speed,
  textColor,
  marqueeBgColor,
  marqueeTextColor,
  borderColor,
  selected,
  onItemClick,
}) {
  const itemRef = useRef(null);
  const marqueeRef = useRef(null);
  const marqueeInnerRef = useRef(null);
  const animationRef = useRef(null);
  const [repetitions, setRepetitions] = useState(4);

  const animationDefaults = { duration: 0.6, ease: 'expo' };

  const findClosestEdge = (mouseX, mouseY, width, height) => {
    const topEdgeDist = distMetric(mouseX, mouseY, width / 2, 0);
    const bottomEdgeDist = distMetric(mouseX, mouseY, width / 2, height);
    return topEdgeDist < bottomEdgeDist ? 'top' : 'bottom';
  };

  const distMetric = (x, y, x2, y2) => {
    const xDiff = x - x2;
    const yDiff = y - y2;
    return xDiff * xDiff + yDiff * yDiff;
  };

  useEffect(() => {
    const calculateRepetitions = () => {
      if (!marqueeInnerRef.current) return;
      const marqueeContent = marqueeInnerRef.current.querySelector('.marquee__part');
      if (!marqueeContent) return;
      const contentWidth = marqueeContent.offsetWidth;
      const viewportWidth = window.innerWidth;
      const needed = Math.ceil(viewportWidth / contentWidth) + 2;
      setRepetitions(Math.max(4, needed));
    };
    calculateRepetitions();
    window.addEventListener('resize', calculateRepetitions);
    return () => window.removeEventListener('resize', calculateRepetitions);
  }, [text, image]);

  useEffect(() => {
    const setupMarquee = () => {
      if (!marqueeInnerRef.current) return;
      const marqueeContent = marqueeInnerRef.current.querySelector('.marquee__part');
      if (!marqueeContent) return;
      const contentWidth = marqueeContent.offsetWidth;
      if (contentWidth === 0) return;
      if (animationRef.current) animationRef.current.kill();

      animationRef.current = gsap.to(marqueeInnerRef.current, {
        x: -contentWidth,
        duration: speed,
        ease: 'none',
        repeat: -1,
      });
    };
    const timer = setTimeout(setupMarquee, 50);
    return () => {
      clearTimeout(timer);
      if (animationRef.current) animationRef.current.kill();
    };
  }, [text, image, repetitions, speed]);

  const handleMouseEnter = (ev) => {
    if (!itemRef.current || !marqueeRef.current || !marqueeInnerRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const edge = findClosestEdge(x, y, rect.width, rect.height);

    gsap
      .timeline({ defaults: animationDefaults })
      .set(marqueeRef.current, { y: edge === 'top' ? '-101%' : '101%' }, 0)
      .set(marqueeInnerRef.current, { y: edge === 'top' ? '101%' : '-101%' }, 0)
      .to([marqueeRef.current, marqueeInnerRef.current], { y: '0%' }, 0);
  };

  const handleMouseLeave = (ev) => {
    if (!itemRef.current || !marqueeRef.current || !marqueeInnerRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const edge = findClosestEdge(x, y, rect.width, rect.height);

    gsap
      .timeline({ defaults: animationDefaults })
      .to(marqueeRef.current, { y: edge === 'top' ? '-101%' : '101%' }, 0)
      .to(marqueeInnerRef.current, { y: edge === 'top' ? '101%' : '-101%' }, 0);
  };

  const handleClick = (ev) => {
    ev.preventDefault();
    if (onItemClick) onItemClick(index);
  };

  const imgClass = `marquee__img${isCustom ? ' marquee__img--premium' : ''}`;

  return (
    <div
      className={`menu__item${selected ? ' menu__item--selected' : ''}${isCustom ? ' menu__item--custom' : ''}`}
      ref={itemRef}
      style={{ borderColor }}
    >
      <a
        className="menu__item-link"
        href={link || '#'}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ color: textColor }}
      >
        {selected && <span className="menu__item-selected-dot" />}
        <span className="menu__item-content">
          <span className="menu__item-name">{text}</span>
          {subtitle && <span className="menu__item-subtitle">{subtitle}</span>}
        </span>
        {price !== undefined && (
          <span className="menu__item-price">₱{price.toLocaleString()}</span>
        )}
      </a>
      <div className="marquee" ref={marqueeRef} style={{ backgroundColor: marqueeBgColor }}>
        <div className="marquee__inner-wrap">
          <div className="marquee__inner" ref={marqueeInnerRef} aria-hidden="true">
            {[...Array(repetitions)].map((_, idx) => (
              <div className="marquee__part" key={idx} style={{ color: marqueeTextColor }}>
                <span>{text}</span>
                {image ? (
                  <div
                    className={imgClass}
                    style={{ backgroundImage: `url(${image})` }}
                  />
                ) : (
                  <div className="marquee__img-placeholder">◈</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowingMenu;
