function n(r){if(typeof r!="string")return null;const t=r.trim();return/[\u0000-\u0020\\]/.test(t)?null:/^https?:\/\//i.test(t)||/^\/(?!\/)/.test(t)?t:null}export{n as r};
