import app from '../dist/server/index.js';

export default {
  fetch(request) {
    return app.fetch(request, process.env);
  },
};
