import { css } from '../../../src/mod.ts'

/** Class names for what the page shows, each one the thing on the screen. */
export const theme = css`
  .page {
    max-width: 44rem;
    margin: 0 auto;
    padding: 1rem;
    font-family: Georgia, 'Times New Roman', serif;
    line-height: 1.6;
    color: #2b2b2b;
  }
  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #e6e0d4;
  }
  .menu,
  .account {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }
  .header a {
    color: #7a4b1e;
    text-decoration: none;
  }
  .header a:hover {
    text-decoration: underline;
  }
  .sign {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .sign input,
  .sign button {
    font: inherit;
    padding: 0.15rem 0.5rem;
    border: 1px solid #ded6c6;
    border-radius: 0.25rem;
    background: #fffdf8;
  }
  .sign button {
    cursor: pointer;
  }
  .breadcrumb {
    color: #8a8275;
    font-size: 0.9rem;
  }
  .quiet {
    color: #8a8275;
  }
  .footer {
    margin-top: 2.5rem;
    padding-top: 1rem;
    border-top: 1px solid #e6e0d4;
    color: #8a8275;
  }
  .listing,
  .notes {
    list-style: none;
    padding: 0;
  }
  .listing li,
  .notes li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid #f0ece2;
  }
  .listing form,
  .notes form {
    margin-left: auto;
  }
  .button {
    font: inherit;
    padding: 0.1rem 0.6rem;
    border: 1px solid #ded6c6;
    border-radius: 0.25rem;
    background: #fffdf8;
    cursor: pointer;
  }
  .compose {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.5rem;
  }
  .compose input {
    flex: 1;
  }
  .vacant {
    color: #8a8275;
    font-style: italic;
  }
`
