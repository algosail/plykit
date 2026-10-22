/**
 * Makes `nextSibling` see a proxied form as the node the tree stored.
 * @example
 * patchFormSibling (document.createElement ('div'))
 */
export const patchFormSibling = (sample: Node): void => {
  let proto: object | null = sample
  while (proto !== null && !Object.hasOwn (proto, 'nextSibling')) {
    proto = Object.getPrototypeOf (proto)
  }
  if (proto === null) {
    throw new Error ('happy-dom: nextSibling is not on the prototype')
  }
  Object.defineProperty (proto, 'nextSibling', {
    configurable: true,
    get(this: Node): ChildNode | null {
      const parent = this.parentNode
      if (parent === null) return null
      const kids = parent.childNodes
      for (let i = 0; i < kids.length; i++) {
        const kid = kids[i]
        if (kid === this || kid.childNodes === this.childNodes) {
          return i + 1 < kids.length ? kids[i + 1] : null
        }
      }
      return null
    },
  })
}
