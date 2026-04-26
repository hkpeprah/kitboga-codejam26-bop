/**
 * @brief Interface application.
 *
 * @param window {Window} Browser window object.
 * @param document {Document} DOM
 * @param container {DOMElement} DOM element containing the skip button.
 *
 * @return Application.
 */
const Interface = (window, document, container) => {
  // DOM elements used by the interface.
  const app = document.createElement("div");
  const appContainer = document.createElement("div");
  const button = document.createElement("button");
  const text = document.createElement("div");
  const attempts = document.createElement("div");

  // Query parameters for overriding behaviour.
  const params = new URLSearchParams(window.location.search);
  const forcedChallenge = params.get("challenge");
  const numAttempts = params.get("attempts") || 3;
  const interfaceTimeout = params.get("timeout") || 30;

  // Button width in pixels.
  const BUTTON_WIDTH = 150;

  // Possible interface challenges (note: some are special).
  const Challenges = Object.freeze({
    IDLE: "idle",
    PRESS_IT: "press-it",
    TEST: "test",
    DEMO: "demo",
    PULL_IT: "pull-it",
    SQUEEZE_IT: "squeeze-it",
    HOLD_IT: "hold-it",
    SHAKE_IT: "shake-it",
    ASSEMBLE_IT: "assemble-it",
  });

  // Text to display on the button for each challenge. Should be 1-to-1 with
  // the above `Challenges` object.
  const ButtonTexts = Object.freeze({
    [Challenges.IDLE]: "Skip Ad...",
    [Challenges.PRESS_IT]: "Press to Skip",
    [Challenges.TEST]: "Testing...",
    [Challenges.DEMO]: "Demo...",
    [Challenges.PULL_IT]: "Pull to Skip",
    [Challenges.SQUEEZE_IT]: "Squeeze to Skip",
    [Challenges.HOLD_IT]: "Hold to Skip",
    [Challenges.SHAKE_IT]: "Shake to Skip",
    [Challenges.ASSEMBLE_IT]: "Assemble to Skip",
  });

  // Variants for the interface.
  const Variants = Object.freeze({
    ROTATE: "rotate",
    DVD: "dvd",
    VANISH: "vanish",
  });

  // State variables.
  let isMouseDown = false;
  let attemptsRemaining = numAttempts;
  let currentChallenge = null;
  let variant = null;
  let intervals = [];
  let timeout = null;
  let eventListeners = [];
  let rotation = 0;

  // Challenges the user must complete.
  const challenges = [
    [Challenges.PRESS_IT, []],
    [Challenges.PULL_IT, []],
    [Challenges.PRESS_IT, [Variants.DVD]],
    [Challenges.HOLD_IT, []],
    [Challenges.PRESS_IT, [Variants.VANISH, 2]],
    [Challenges.SQUEEZE_IT, []],
    [Challenges.PRESS_IT, [Variants.DVD, 2]],
    [Challenges.SHAKE_IT, []],
    [Challenges.ASSEMBLE_IT, []],
  ];
  let remainingChallenges = [];

  /**
   * @brief Computes the rotation axis of the DOM element relative to the
   * origin.
   *
   * @param element {DOMElement} Element whose rotation axis to compute.
   *
   * @return `{x, y}` rotation for the new origin of the rotated axis.
   */
  const getRotationAxis = (element) => {
    const style = window.getComputedStyle(element);
    const transform = style.transform;

    if (transform === "none") {
      return {
        x: 1,
        y: 0
      };
    }

    // matrix(a, b, c, d, tx, ty)
    const match = transform.match(/matrix\(([^)]+)\)/);
    if (!match) {
      return {
        x: 1,
        y: 0
      };
    }

    const values = match[1].split(",").map(Number);
    const [a, b] = values;

    // Normalized direction vector.
    const length = Math.hypot(a, b);
    return {
      x: a / length,
      y: b / length
    };
  }

  /**
   * @brief Performs a scalar projection.
   *
   * @param point {Object} Point on the 2D element to project.
   * @param axis {Object} Coordinate axis to project onto.
   *
   * @return Length of the projected vector.
   */
  const project = (point, axis) => {
    return point.x * axis.x + point.y * axis.y;
  }

  /**
   * @brief Applies a reduction to a delta value for reducing drag width
   * transformations.
   *
   * @param delta {Float} Original delta function.
   *
   * @return Reduced delta value.
   */
  const applyResistance = (delta) => {
    // Use a smaller number for a smoother pull.
    const k = 0.00001;
    return delta / (1 + k * Math.abs(delta));
  }

  /**
   * @brief Finds the point where a line segment hits the clipping line.
   *
   * @param p1 {Object} First point.
   * @param p2 {Object} Second point.
   * @param a {Float} X direction of the vector from the origin.
   * @param b {Float} Y direction of the vector from the origin.
   * @param c {Float} Length of the vector from the origin.
   *
   * @return Point at which the line from `p1` to `p2` intersects the vector.
   */
  const intersect = (p1, p2, a, b, c) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const t = (c - (a * p1.x) - (b * p1.y)) / ((a * dx) + (b * dy));

    return {
      x: p1.x + dx * t,
      y: p1.y + dy * t,
    }
  }

  /**
   * @brief Performs half-plane clipping on a polygon.
   *
   * @details Divides a polygon into a portion to keep and a portion to be
   * removed.
   *
   * @param points {Array} Array of points that make up the polygon.
   * @param a {Float} X direction of the vector from the origin.
   * @param b {Float} Y direction of the vector rom the origin.
   * @param c {Float} How far the vector is from the origin.
   *
   * @return Array of points that make up the clipped polygon.
   */
  const clipPolygon = (points, a, b, c) => {
    const res = [];

    for (let i = 0; i < points.length; i++) {
      const currPoint = points[i];
      const nextPoint = points[(i + 1) % points.length];

      const insideCurr = ((a * currPoint.x) + (b * currPoint.y)) <= c;
      const insideNext = ((a * nextPoint.x) + (b * nextPoint.y)) <= c;

      if (insideCurr && insideNext) {
        res.push(nextPoint);
      } else if (insideCurr && !insideNext) {
        res.push(intersect(currPoint, nextPoint, a, b, c));
      } else if (!insideCurr && insideNext) {
        res.push(intersect(currPoint, nextPoint, a, b, c));
        res.push(nextPoint);
      }
    }

    return res;
  }

  /**
   * @brief Returns a random float in the range of `min` to `max`.
   *
   * @param min {Float} Minimum value.
   * @param max {Float} Maximum value (inclusive).
   *
   * @return Random float in range of `min` to `max`.
   */
  const randomInRange = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * @brief Returns a boolean indicating if the given `value` is in the range of
   * `min` and `max` inclusive.
   *
   * @param value {Float} Value to check in range.
   * @param min {Float} Minimum value.
   * @param max {Float} Maximum value (inclusive).
   *
   * @return `true` if in range, otherwise `false`.
   */
  const inRange = (value, min, max) => {
    return ((value >= min) && (value <= max));
  }

  /**
   * @brief Returns a boolean indicating if we are in test mode.
   *
   * @return `true` if test mode, else `false`.
   */
  const isTestMode = () => {
    if (!forcedChallenge) {
      return false;
    }

    return (forcedChallenge == Challenges.TEST);
  }

  /**
   * @brief Returns a boolean indicating if we are in demo mode.
   *
   * @return `true` if test mode, else `false`.
   */
  const isDemoMode = () => {
    if (!forcedChallenge) {
      return false;
    }

    return (forcedChallenge == Challenges.DEMO);
  }

  /**
   * @brief Removes all event listeners bound by the interface.
   */
  const removeEventListeners = () => {
    // Remove all event listeners.
    eventListeners.forEach((e) => {
      e[2].removeEventListener(e[0], e[1]);
    });
    eventListeners = [];
  }

  /**
   * @brief Removes any bound timers.
   *
   * @param all {Boolean} Whether to remove all timers (includes the global
   * timer).
   */
  const removeTimers = (all) => {
    if (all && timeout) {
      clearTimeout(timeout);
      timeout = null;
    }

    if (intervals) {
      intervals.forEach((interval) => {
        clearInterval(interval);
      });
      intervals = [];
    }
  }

  /**
   * @brief Resets the interface state.
   */
  const reset = () => {
    rotation = 0;
    variant = null;

    removeTimers();
    removeEventListeners();

    // Remove any stylings on the attempts remaining element.
    attempts.className = "interface-attempts";
    attempts.style.display = "none";
    attempts.textContent = `${attemptsRemaining < 0 ? 0 : attemptsRemaining} attempts remaining`;

    // Reset any styling done to the text.
    text.className = "interface-button-text";
    text.style.width = `${BUTTON_WIDTH}px`;
    text.style.transform = "rotate(0deg)";
    text.style.transformOrigin = "";
    text.style.background = "";
    text.style.color = "";
    text.textContent = "";

    // Reset any styling done to the button.
    button.className = "interface-button";
    button.style.transform = "none";
    button.style.display = "inline-block";
    button.style.top = "";
    button.style.left = "";
    button.style.right = "10px";
    button.style.bottom = "10px";
    button.style.background = "";
    button.style.animation = "";

    challenge = null;
  }

  /**
   * @brief Animates the submit button using the DVD bounce animation.
   *
   * @param multiplier {Float} Multiplier to increase the speed of the animation.
   */
  const animateBounce = (multiplier) => {
    let xPos = button.offsetLeft;
    let yPos = button.offsetTop;

    let buttonDown = false;

    const width = button.offsetWidth;
    const height = button.offsetHeight;

    rotation = Math.random() * 360;

    addEventListener("pointerdown", () => {
      buttonDown = true;
    });

    intervals.push(setInterval(() => {
      if (buttonDown) {
        return;
      }

      const rad = rotation * Math.PI / 180;
      const xDelta = Math.cos(rad) * multiplier;
      const yDelta = Math.sin(rad) * multiplier;
      const points = [
        [xPos + xDelta, yPos + yDelta],
        [xPos + xDelta + width, yPos + yDelta],
        [xPos + xDelta + width, yPos + yDelta + height],
        [xPos + xDelta, yPos + yDelta + height],
      ];

      let collide = false;
      points.forEach((p) => {
        collide |= (p[0] <= 0);
        collide |= (p[0] >= container.offsetWidth);
        collide |= (p[1] <= 0);
        collide |= (p[1] >= container.offsetHeight);
      });

      if (collide) {
        // Collision with the container occurred, so update its trajectory.
        rotation = (rotation + (Math.random() * 90)) % 360;
      } else {
        yPos += yDelta;
        xPos += xDelta;
        button.style.top = `${yPos}px`;
        button.style.left = `${xPos}px`;
      }

      text.style.transform = `rotate(${-rotation}deg)`;
      button.style.transform = `rotate(${rotation}deg)`;
    }, 0.1));
  }

  /**
   * @brief Animates a button disappearing and re-appearing.
   *
   * @param multiplier {Float} Multiplier to increase the speed of vanishing.
   * @param visibleDuration {Float} Number of milliseconds to display the button for.
   */
  const animateVanish = (multiplier) => {
    let buttonDown = false;
    let animating = false;

    const width = button.offsetWidth;
    const height = button.offsetHeight;

    const visibleDuration = 1000 / (multiplier || 1);

    button.style.opacity = 0;

    addEventListener("pointerdown", () => {
      buttonDown = true;
    });

    addEventListener("pointerdown", () => {
      buttonDown = true;
    }, container);

    intervals.push(setInterval(() => {
      if (buttonDown || animating) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const yPos = randomInRange(0, containerRect.height - buttonRect.height);
      const xPos = randomInRange(0, containerRect.width - buttonRect.width);

      animating = true;
      button.style.top = `${yPos}px`;
      button.style.left = `${xPos}px`;
      button.style.animation = "fade-in 0.5s ease-out forwards";
      button.style.opacity = "";

      text.style.transform = `rotate(${-rotation}deg)`;
      button.style.transform = `rotate(${rotation}deg)`;

      button.addEventListener("animationend", () => {
        button.style.animation = "";
        setTimeout(() => {
          animating = false;
        }, visibleDuration);
      }, {
        once: true,
      });
    }, 0.1));
  }

  /**
   * @brief Sets up the press button.
   *
   * @details User must press the button to continue. Arguments are:
   *  1. Variant; and
   *  2. Multiplier for the animation speed.
   *
   * @param args {Object} Optional arguments for configuring the interface.
   */
  const pressIt = (args) => {
    let buttonEntered = false;

    addEventListener("pointerdown", (ev) => {
      buttonEntered = true;
      ev.preventDefault();
      ev.stopPropagation();
    });

    addEventListener("pointerleave", (ev) => {
      ev.preventDefault();
      if (buttonEntered) {
        onFail();
      }
    });

    addEventListener("pointerup", (ev) => {
      if (buttonEntered) {
        ev.preventDefault();
        ev.stopPropagation();
        onAdvance();
      }
    });

    addEventListener("pointerdown", (ev) => {
      if (!isMouseDown) {
        onFail();
      }
    }, container);

    variant = (args && args.length) ? args[0] : null;
    const multiplier = (args && (args.length > 1)) ? args[1] : 1.01;

    switch (variant) {
      case Variants.ROTATE:
        rotation = randomInRange(-90, 90);
        text.style.transform = `rotate(${rotation}deg)`;
        break;

      case Variants.DVD:
        animateBounce(multiplier);
        break;

      case Variants.VANISH:
        animateVanish(multiplier);
        break;

      default:
        break;
    }
  }

  /**
   * @brief Sets up the hold it button.
   *
   * @details User must hold the button to continue. Arguments are:
   *  1. Variant; and
   *  2. Multiplier for the animation speed.
   *
   * @param args {Object} Optional arguments for configuring the interface.
   */
  const holdIt = (args) => {
    let percent = 0;
    let failed = false;

    variant = (args && args.length) ? args[0] : null;
    const multiplier = (args && (args.length > 1)) ? args[1] : 1;

    addEventListener("pointerdown", (ev) => {
      intervals.push(setInterval(() => {
        percent += 1;

        text.style.background = `linear-gradient(to top, #F59E0B99 ${percent}%, #FFFFFF ${percent}%)`;
        button.style.animation = "shake-x 1s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite";

        if (percent > 100) {
          onAdvance();
        }
      }, 25));

      ev.preventDefault();
      ev.stopPropagation();
    });

    addEventListener("pointerleave", (ev) => {
      ev.preventDefault();
      if (percent && (percent < 100) && !failed) {
        failed = true;
        onFail();
      }
    });

    addEventListener("pointerup", (ev) => {
      if (percent && (percent < 100) && !failed) {
        ev.preventDefault();
        ev.stopPropagation();
        failed = true;
        onFail();
      }
    });

    addEventListener("pointerdown", (ev) => {
      if (!isMouseDown && !failed) {
        failed = true;
        onFail();
      }
    }, container);

    switch (variant) {
      case Variants.ROTATE:
        rotation = randomInRange(-90, 90);
        text.style.transform = `rotate(${rotation}deg)`;
        break;

      case Variants.DVD:
        animateBounce(multiplier);
        break;

      case Variants.VANISH:
        animateVanish(multiplier);
        break;

      default:
        break;
    }
  }

  /**
   * @brief Sets up the shake it button.
   *
   * @details User must shake the button to continue. Arguments are:
   *  1. Variant;
   *  2. Multiplier for the animation speed;
   *  3. Minimum distance (in pixels) the user has to drag per shake; and
   *  4. Percentage of the shake it button fill to decrement per shake.
   *
   * @param args {Object} Optional arguments for configuring the interface.
   */
  const shakeIt = (args) => {
    let percent = 100;
    let coords = null;
    let direction = null;

    variant = (args && args.length) ? args[0] : null;

    const multiplier = (args && (args.length > 1)) ? args[1] : 1;
    const minDistance = (args && (args.length > 2)) ? args[2] : 10;
    const percentPerDecrement = (args && (args.length > 3)) ? args[3] : 2;

    const updateColour = () => {
      text.style.background = `linear-gradient(to top, #7C3AED99 ${percent}%, #FFFFFF ${percent}%)`;
    }

    updateColour();

    addEventListener("pointerdown", (ev) => {
      const point = ev.touches ? ev.touches[0] : ev;

      // Record the current position of the mouse.
      coords = {
        x: point.clientX,
        y: point.clientY,
      };

      ev.preventDefault();
      ev.stopPropagation();
    });

    addEventListener("pointerup", (ev) => {
      if (percent && (percent > 0)) {
        ev.preventDefault();
        ev.stopPropagation();
        onFail();
      }
    });

    addEventListener("pointerdown", (ev) => {
      if (!isMouseDown && !coords) {
        onFail();
      }
    }, container);

    const onMove = (ev) => {
      if (!coords) {
        return;
      }

      // To determine how much to drain, we compute the length of the vector
      // between the previous position and the current position. To
      // successfully shake, the user has to move back and forth in opposite
      // directions.
      const point = ev.touches ? ev.touches[0] : ev;
      const xDiff = point.clientX - coords.x;
      const yDiff = point.clientY - coords.y;
      const distance = Math.sqrt(xDiff * xDiff + yDiff * yDiff);

      if (!direction) {
        // No direction set yet, so use the direction from the initial move.
        direction = (xDiff < 0 ? -1 : 1);
      }

      let decrement = false;
      if (direction === 1) {
        decrement = (distance >= minDistance);
      } else if (direction === -1) {
        decrement = (Math.abs(distance) >= minDistance);
      }

      if (decrement) {
        direction = (direction === -1 ? 1 : -1);
        coords = {
          x: ev.clientX,
          y: ev.clientY,
        };

        percent -= percentPerDecrement;
        updateColour();

        // Update the position of the button to simulate a shake.
        const xPos = button.offsetLeft + xDiff;
        const yPos = button.offsetTop + yDiff;

        button.style.top = `${yPos}px`;
        button.style.left = `${xPos}px`;
        button.style.animation = "shake-x 1s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite";
      }

      if (percent <= 0) {
        button.style.animation = "";
        onAdvance();
      }
    }

    addEventListener("pointermove", onMove);
    addEventListener("pointermove", onMove, container);

    switch (variant) {
      case Variants.ROTATE:
        rotation = randomInRange(-90, 90);
        text.style.transform = `rotate(${rotation}deg)`;
        break;

      case Variants.DVD:
        animateBounce(multiplier);
        break;

      case Variants.VANISH:
        animateVanish(multiplier);
        break;

      default:
        break;
    }
  }

  /**
   * @brief Configures the app for the assemble-it interface.
   *
   * @details User must assemble all pieces of the dragon balls in order to
   * continue. Arguments are:
   *   1. Variant;
   *   2. Multiplier for the animation speed; and
   *   3. Number of pieces to break the button into.
   *
   * @param args {Object} Optional arguments for configuring the interface.
   */
  const assembleIt = (args) => {
    variant = (args && args.length > 0) ? args[0] : null;

    const multiplier = (args && args.length > 1) ? args[1] : 1;
    const numPoints = (args && args.length > 2) ? args[2] : 10;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const center = {
      x: container.clientWidth / 2,
      y: container.clientHeight / 2,
    };

    // Main button is always in the center for assemble.
    button.style.top = `${(containerRect.height - buttonRect.height) / 2}px`;
    button.style.left = `${(containerRect.width - buttonRect.width) / 2}px`;
    button.style.right = "";
    button.style.bottom = "";

    // Get dimensions of the button.
    const width = button.clientWidth;
    const height = button.clientHeight;

    // Generate random points within the button to use as the fracture points.
    const points = Array.from({ length: numPoints }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
    }));

    const createBoundingBox = () => {
      return [
        {
          x: 0,
          y: 0,
        },
        {
          x: width,
          y: 0,
        },
        {
          x: width,
          y: height
        },
        {
          x: 0,
          y: height,
        }
      ];
    }

    /**
     * @brief Voronoi cell generator.
     *
     * @param point {Object} Point to clip a polygon for.
     *
     * @return Closest clipped polygon to the specified point.
     */
    const computeCell = (point) => {
      let cell = createBoundingBox();

      for (let other of points) {
        if (other == point) {
          // Ignore the origin point.
          continue;
        }

        // Compute midpoint between the two points.
        const midX = (point.x + other.x) / 2;
        const midY = (point.y + other.y) / 2;

        const dx = other.x - point.x;
        const dy = other.y - point.y;

        const a = dx;
        const b = dy;
        const c = a * midX + b * midY;

        cell = clipPolygon(cell, a, b, c);
        if (!cell.length) {
          break;
        }
      }

      return cell;
    }

    /**
     * @brief Converts a polygon to a CSS clip-path.
     *
     * @param cell {Object} Array of four points that make up a polygon.
     *
     * @return CSS clip path string.
     */
    const toClipPath = (cell) => {
      const pString = cell.map((p) => {
        return `${(p.x / width) * 100}% ${(p.y / height) * 100}%`;
      }).join(",");
      return `polygon(${pString})`;
    }

    // Generate the pieces.
    const pieces = [];

    points.forEach((point, index) => {
      const cell = computeCell(point);
      if (cell.length < 3) {
        // Not enough points for the polygon.
        return;
      }

      const clone = text.cloneNode(true);
      clone.classList.add("interface-button-piece");
      clone.style.clipPath = toClipPath(cell);

      text.appendChild(clone);

      // Compute the centroid.
      const centroid = cell.reduce((acc, p) => ({
        x: acc.x + p.x,
        y: acc.y + p.y,
      }), {
        x: 0,
        y: 0,
      });

      centroid.x /= cell.length;
      centroid.y /= cell.length;

      // Compute the offset of the button within the container.
      const offsetX = buttonRect.left - containerRect.left;
      const offsetY = buttonRect.top - containerRect.top;

      // Compute center of piece relative to the container.
      const cx = centroid.x + offsetX;
      const cy = centroid.y + offsetY;

      const dx = cx - center.x;
      const dy = cy - center.y;

      // Compute a uniform direction vector so pieces are spread out evenly.
      const span = (360 / points.length);
      const angle = randomInRange((span * index), (span * (index + 1)));

      let vx = Math.cos(angle);
      let vy = Math.sin(angle);;

      const mag = Math.hypot(vx, vy) || 1;
      vx /= mag;
      vy /= mag;

      // Compute the distance to the edge of the container.
      let distances = [];
      if (vx > 0) {
        distances.push((container.clientWidth - cx) / vx);
      } else if (vx < 0) {
        distances.push((0 - cx) / vx);
      }

      if (vy > 0) {
        distances.push((container.clientHeight - cy) / vy);
      } else if (vy < 0) {
        distances.push((0 - cy) / vy);
      }

      distances = distances.filter((d) => {
        return (d > 0) && isFinite(d);
      });

      pieces.push({
        el: clone,
        vx: vx,
        vy: vy,
        origin: {
          x: cx,
          y: cy,
        },
        rot: (Math.random() - 0.5) * 20,
        maxDist: Math.min(...distances),
      });
    });

    pieces.forEach((piece) => {
      piece.el.style.opacity = 0;
    });

    button.style.animation = "explode 1s cubic-bezier(0.36, 0.07, 0.19, 0.97)";
    button.addEventListener("animationend", () => {
      text.style.background = "#00000011";
      text.style.color = "#22222255";

      pieces.forEach((piece) => {
        // Compute distance from the origin for the piece to fly to.
        const dist = piece.maxDist * (0.3 + (Math.random() * 0.2));

        piece.el.style.transition = "transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.8s";
        piece.el.style.transform = `translate(${piece.vx * dist}px, ${piece.vy * dist}px) rotate(${piece.rot}deg)`;
        piece.el.style.opacity = 1;

        piece.state = {
          x: piece.vx * dist,
          y: piece.vy * dist,
          locked: false,
          drag: null,
        };

        piece.el.addEventListener("pointerdown", (ev) => {
          if (piece.state.locked) {
            return;
          }

          const point = ev.touches ? ev.touches[0] : ev;

          piece.state.drag = {
            offsetX: point.clientX - containerRect.left - piece.state.x,
            offsetY: point.clientY - containerRect.top - piece.state.y,
          };

          piece.el.setPointerCapture(ev.pointerId);
        });

        piece.el.addEventListener("pointermove", (ev) => {
          if (!piece.state.drag || piece.state.locked) {
            return;
          }

          const point = ev.touches ? ev.touches[0] : ev;
          piece.state.x = point.clientX - containerRect.left - piece.state.drag.offsetX;
          piece.state.y = point.clientY - containerRect.top - piece.state.drag.offsetY;

          piece.el.style.transition = "transform 0.08s ease-out";
          piece.el.style.transform = `translate(${piece.state.x}px, ${piece.state.y}px)`;

          // Check if the piece overlaps the original button.
          const pieceRect = piece.el.getBoundingClientRect();
          const textRect = text.getBoundingClientRect();
          const deltaY = pieceRect.top - textRect.top;
          const deltaX = pieceRect.left - textRect.left;

          if ((Math.abs(deltaY) < 1) && (Math.abs(deltaX) < 1)) {
            piece.el.style.transform = "";
            piece.el.style.transition = "";
            piece.state.locked = true;
            piece.el.classList.add("interface-button-piece-inactive");

            if (pieces.every((p) => p.state.locked)) {
              onAdvance();
            }
          }
        });

        piece.el.addEventListener("pointerup", () => {
          piece.state.drag = null;
          piece.el.style.transition = "transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)";
        });
      });
    }, {
      once: true
    });
  }

  /**
   * @brief Configures the app for the pull-it interface.
   *
   * @details User must press and drag on an end of the button in order to
   * continue. Arguments are:
   *  1. Variant; and
   *  2. Multiplier for the animation speed.
   *
   * @param args {Object} Optional arguments for configuring the interface.
   */
  const pullIt = (args) => {
    return dragIt(true, args);
  }

  /**
   * @brief Configures the app for the squeeze-it interface.
   *
   * @details User must press and drag inwards on the button in order to
   * continue. Arguments are:
   *  1. Variant; and
   *  2. Multiplier for the animation speed.
   *
   * @param args {Object} Optional arguments for configuring the interface.
   */
  const squeezeIt = (args) => {
    return dragIt(false, args);
  }

  /**
   * @brief Implementation function for the pull it and squeeze it interface.
   *
   * @details Arguments are:
   *  1. Variant; and
   *  2. Multiplier for the animation speed.
   *
   * @param outwards {Boolean} `true` if user should drag outwards.
   * @param args {String} Arguments for configuring the drag.
   */
  const dragIt = (outwards, args) => {
    let startProj = 0;
    let startWidth = 0;
    let prevDelta = null;
    let axis = {
      x: 1,
      y: 0
    };
    let center = {
      x: 0,
      y: 0
    };
    let direction = 1;
    let targetWidth = null;

    variant = (args && args.length) ? args[0] : null;
    const multiplier = (args && (args.length > 1)) ? args[1] : 2;

    // Even if we are currently dragging, set it to false as to not invoke
    // any of the listeners until we get a new pointer down event.
    let isDragging = false;

    switch (variant) {
      case Variants.ROTATE:
        rotation = randomInRange(-45, 45);
        button.style.transform = `rotate(${rotation}deg)`;
        break;

      default:
        break;
    }

    /**
     * @brief Invoked on touch down event. Records the starting state of the
     * drag.
     *
     * @details Records the starting position.
     */
    addEventListener("pointerdown", (ev) => {
      isDragging = true;

      const point = ev.touches ? ev.touches[0] : ev;
      const rect = text.getBoundingClientRect();
      center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      axis = getRotationAxis(text);

      const startPoint = {
        x: point.clientX,
        y: point.clientY
      };

      // Projection relative to center.
      startProj = project({
        x: startPoint.x - center.x,
        y: startPoint.y - center.y
      }, axis);

      direction = Math.sign(startProj) || 1;
      startWidth = button.offsetWidth;
      targetWidth = startWidth * (outwards ? multiplier : (1 / multiplier));
    });

    /**
     * @brief For the pull-it interface, they have to drag outwards until a
     * certain value is reached. Pulling inwards will fail.
     *
     * @param ev {Event} The pointer move event.
     */
    addEventListener("pointermove", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      if (!isDragging) {
        return;
      }

      const point = ev.touches ? ev.touches[0] : ev;

      const currentProj = project({
        x: point.clientX - center.x,
        y: point.clientY - center.y
      }, axis);

      // Only allow movement further outward in same direction.
      const rawDelta = (currentProj - startProj) * direction;
      const resistedDelta = applyResistance(rawDelta);

      // Check if the delta is growing in the outwards direction when pulling,
      // or inwards when squeezing.
      if ((prevDelta === null) ||
          (outwards && (resistedDelta >= prevDelta)) ||
          (!outwards && (resistedDelta <= prevDelta))) {

        // Direction tells us whether we are dragging towards `left` (`-1`) or
        // towards `right` (`1`). We apply the opposite transform origin to
        // ensure the button grows towards the cursor.
        if (direction === -1) {
          text.style.transformOrigin = "right center";
        } else {
          text.style.transformOrigin = "left center";
        }

        prevDelta = resistedDelta;

        const scaleX = (startWidth + prevDelta) / startWidth;
        text.style.transform = `scaleX(${scaleX}) scaleY(${1 - prevDelta / 500})`;

        // If target width has been reached, then advance to the
        // next challenge.
        const buttonWidth = startWidth + prevDelta;
        if ((outwards && (buttonWidth >= targetWidth)) ||
            (!outwards && (buttonWidth <= targetWidth))) {
          onAdvance();
        }
      } else {
        onFail();
      }
    }, container);

    /**
     * @brief Invoked on touch event.
     *
     * @param ev {Event} The pointer up / leave event.
     */
    const onEnd = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      if (isDragging) {
        isDragging = false;
        prevDelta = null;
        onFail();
      }
    }

    addEventListener("pointerup", onEnd);
    addEventListener("pointerup", onEnd, container);
  }

  /**
   * @brief Invoked to start the interface.
   *
   * @details Starts the global interface timer when the submit button is
   * pressed.
   */
  const startIt = () => {
    addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      if (timeout) {
        clearTimeout(timeout);
      }

      if (!forcedChallenge || !isTestMode()) {
        timeout = setTimeout(() => {
          onFail();
        }, interfaceTimeout * 1000);
      }

      onAdvance();
    });
  }

  /**
   * @brief Registers an event listener.
   *
   * @details Used to keep track of any bound event listeners in order to
   * remove them when the type of interface changes. If `target` is not
   * provided, then the event listener is bound to the button.
   *
   * @param eventName {String} Event to listen for on the button.
   * @param eventFunc {Function} Function to invoke on event.
   * @param target {Element} Optioanl DOM element to register the listener to.
   */
  const addEventListener = (eventName, eventFunc, target) => {
    target = target ? target : button;
    eventListeners.push([eventName, eventFunc, target]);
    target.addEventListener(eventName, eventFunc);
  }

  /**
   * @brief Called when the current interface has been successful, and the next
   * challenge should be advanced to.
   */
  const onAdvance = () => {
    if (remainingChallenges.length == 0) {
      onSuccess();
    } else {
      // Only advance to the next cahllenge if we are in test mode or the
      // regular game code. For others, just return back to the same challenge.
      if (isTestMode() || !forcedChallenge) {
        const transition = remainingChallenges.shift();
        reset();
        onChallengeChanged(transition[0], transition[1]);
      } else {
        const newChallenge = currentChallenge;
        reset();
        onChallengeChanged(newChallenge);
      }
    }
  }

  /**
   * @brief Invoked when the interface is failed.
   */
  const onFail = () => {
    removeTimers(true);
    removeEventListeners();

    text.style.transform = "rotate(0deg)";
    text.style.transformOrigin = "";
    text.textContent = "Failed!";
    text.style.animation = "";

    button.classList.add("interface-button-fail");
    button.style.transformOrigin = "";
    button.style.animation = "shake-x 0.9s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite";

    attemptsRemaining -= (forcedChallenge ? 0 : 1);
    attempts.textContent = `${attemptsRemaining < 0 ? 0 : attemptsRemaining} attempts remaining`;
    attempts.style.display = "block";

    setTimeout(() => {
      if (attemptsRemaining <= 0) {
        console.log("Failed");

        window.top.postMessage({
          type: "fail"
        }, "*");
      } else {
        onAdStarted();
      }
    }, 1000);
  }

  /**
   * @brief Notify the container window that the interface has been completed
   * successfully.
   */
  const onSuccess = () => {
    console.log("Success");

    removeTimers(true);
    removeEventListeners();

    window.top.postMessage({
      type: "success"
    }, "*");
  };

  /**
   * @brief Invoked when the ad begins.
   *
   * @details This method should make the interface button visible and handle
   * any necessary logic for starting the skip button.
   */
  const onAdStarted = () => {
    attemptsRemaining = numAttempts;
    app.style.display = "block";

    reset();

    remainingChallenges = [...challenges];

    onChallengeChanged(forcedChallenge || Challenges.IDLE);
  }

  /**
   * @brief Updates the challenge the user has to perform.
   *
   * @param newChallenge {String} New interface challenge.
   * @param args {Object} Arguments to pass to the challenge function.
   */
  const onChallengeChanged = (newChallenge, args) => {
    currentChallenge = newChallenge;

    // Determine a random position for the button.
    if (newChallenge != Challenges.IDLE) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();

      button.style.top = `${randomInRange(0, containerRect.height - buttonRect.height)}px`;
      button.style.left = `${randomInRange(0, containerRect.width - buttonRect.width)}px`;
      button.style.right = "";
      button.style.bottom = "";
    }

    // Remove any of the non-standard button classes.
    Object.keys(Challenges).forEach((className) => {
      button.classList.remove(`interface-button-${className}`);
    });

    button.classList.add(`interface-button-${newChallenge}`);
    text.textContent = ButtonTexts[newChallenge];

    const func = Object.freeze({
      [Challenges.PRESS_IT]: pressIt,
      [Challenges.HOLD_IT]: holdIt,
      [Challenges.SHAKE_IT]: shakeIt,
      [Challenges.ASSEMBLE_IT]: assembleIt,
      [Challenges.PULL_IT]: pullIt,
      [Challenges.SQUEEZE_IT]: squeezeIt,
      [Challenges.TEST]: () => {
        reset();
        onChallengeChanged(Challenges.IDLE);
      },
      [Challenges.DEMO]: () => {
        reset();
        onChallengeChanged(Challenges.IDLE);
      },
      [Challenges.IDLE]: startIt,
    })[newChallenge];

    if (func) {
      const soundName = newChallenge;
      const sound = new Audio();

      sound.addEventListener("error", () => {
        // File Not Found (404).
      });

      sound.addEventListener("loadeddata", () => {
        sound.play().catch((err) => {
          // Not Allowed Error (User interaction missing).
        });
      });

      func(args);

      const shouldPlaySound = !(
        [Challenges.TEST, Challenges.DEMO, Challenges.IDLE].some((_challenge) => {
          return (_challenge === newChallenge);
        })
      );

      if (shouldPlaySound) {
        sound.src = `./sounds/${soundName}.mp3`;
      }
    } else {
      console.log(`Missing handler for ${newChallenge}`);
    }
  }

  /**
   * @brief Invoked when the ad finishes without the interface have been
   * completed.
   *
   * @details By default, if the user doesn't "skip" the ad before the video
   * ends, the handler should post a fail message. Alternative behaviour
   * can be implemented by the user such as showing an example or survey.
   */
  const onAdFinished = () => {
    attemptsRemaining = 0;
    onFail();
  };

  /**
   * @brief Event handler for messages from the game shell.
   *
   * @param event {Event} Posted event from the game shell.
   */
  const onMessage = (event) => {
    if (!event.data || !event.data.type) {
      return;
    }

    switch (event.data.type) {
      case "adStarted":
        console.log("Ad started");
        onAdStarted();
        break;

      case "adFinished":
        console.log("Ad finished");
        onAdFinished();
        break;

      default:
        break;
    }
  }

  /**
   * @brief Renders the components for the the interface.
   */
  const render = (() => {
    button.appendChild(text);

    appContainer.className = "interface-container";
    appContainer.appendChild(button);
    appContainer.appendChild(attempts);

    app.className = "interface-app";
    app.appendChild(appContainer);
    app.style.display = "none";

    container.appendChild(app);

    if (forcedChallenge) {
      onAdStarted();
    }

    return this;
  }).bind(this);

  // Bind listener for game shell messages.
  window.addEventListener("message", onMessage);

  // Need to track dragging at the global level.
  window.addEventListener("pointerdown", () => {
    isMouseDown = true;
  });

  window.addEventListener("pointerup", () => {
    isMouseDown = false;
  });

  window.addEventListener("pointerleave", () => {
    isMouseDown = false;
  });

  window.addEventListener("keydown", (ev) => {
    if (!isDemoMode()) {
      return;
    }

    if (ev.key === " ") {
      let newChallenge = null;

      switch (currentChallenge) {
        case Challenges.IDLE:
          newChallenge = Challenges.PRESS_IT;
          break;

        case Challenges.PRESS_IT:
          newChallenge = Challenges.PULL_IT;
          break;

        case Challenges.PULL_IT:
          newChallenge = Challenges.SQUEEZE_IT;
          break;

        case Challenges.SQUEEZE_IT:
          newChallenge = Challenges.HOLD_IT;
          break;

        case Challenges.HOLD_IT:
          newChallenge = Challenges.SHAKE_IT;
          break;

        case Challenges.SHAKE_IT:
          newChallenge = Challenges.ASSEMBLE_IT;
          break;

        case Challenges.ASSEMBLE_IT:
          newChallenge = Challenges.IDLE;
          break;

        default:
          console.log(`Unhandled challenge: ${currentChallenge}`);
          break;
      }

      reset();
      onChallengeChanged(newChallenge);
    }

    if ((ev.key === "v") || (ev.key === "V")) {
      let newVariant = null;
      const newChallenge = currentChallenge;

      switch (variant) {
        case Variants.ROTATE:
          newVariant = Variants.DVD;
          break;

        case Variants.DVD:
          newVariant = Variants.VANISH;
          break;

        case Variants.VANISH:
          newVariant = null;
          break;

        default:
          newVariant = Variants.ROTATE;
          break;
      }

      reset();
      onChallengeChanged(newChallenge, [newVariant]);
    }
  });

  window.interfaceApp = this;
  return render();
};

/**
 * @brief Initializes the interface application.
 *
 * @param window {Window} Browser window object.
 * @param document {Document} DOM.
 */
((window, document) => {
  const container = document.getElementById("overlay-container");
  return Interface(window, document, container);
})(window, document);
