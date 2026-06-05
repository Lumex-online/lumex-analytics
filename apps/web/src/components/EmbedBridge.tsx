import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  ANALYTICS_EMBED_READY_EVENT,
  ANALYTICS_EMBED_RESIZE_EVENT,
  resolveParentOrigin
} from "../lib/embed";

function postHeight(targetOrigin: string, path: string) {
  if (typeof window === "undefined" || window.parent === window) {
    return;
  }

  const height = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    document.documentElement.offsetHeight,
    document.body.offsetHeight
  );

  window.parent.postMessage(
    {
      type: ANALYTICS_EMBED_RESIZE_EVENT,
      height,
      path
    },
    targetOrigin
  );
}

export function EmbedBridge() {
  const location = useLocation();

  useEffect(() => {
    document.body.classList.add("app--embedded");

    return () => {
      document.body.classList.remove("app--embedded");
    };
  }, []);

  useEffect(() => {
    const targetOrigin = resolveParentOrigin(location.search);
    const path = `${location.pathname}${location.search}`;

    window.parent?.postMessage(
      {
        type: ANALYTICS_EMBED_READY_EVENT,
        path
      },
      targetOrigin
    );

    const sendResize = () => postHeight(targetOrigin, path);
    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(sendResize);
    });

    resizeObserver.observe(document.documentElement);
    resizeObserver.observe(document.body);
    window.addEventListener("load", sendResize);
    window.addEventListener("resize", sendResize);
    window.requestAnimationFrame(sendResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("load", sendResize);
      window.removeEventListener("resize", sendResize);
    };
  }, [location.pathname, location.search]);

  return null;
}
