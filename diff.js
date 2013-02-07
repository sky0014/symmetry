(function() {
"use strict";
/*global require, exports, window */

var Symmetry;
if (typeof(exports) !== 'undefined') {
    Symmetry = exports;
}
else {
    if (!window.Symmetry) window.Symmetry = {};
    Symmetry = window.Symmetry;
}

Symmetry.diff = diffValue;

// Compare and return `none`, `reset` or a patch.
function diffValue(left, right) {
    // Treat undefined as null.
    if (left  === undefined) left  = null;
    if (right === undefined) right = null;

    // Identical, don't even need to descend.
    if (left === right)
        return 'none';

    if (left && right) {
        // Descend into two arrays.
        var leftIsArray  = Array.isArray(left);
        var rightIsArray = Array.isArray(right);
        if (leftIsArray && rightIsArray)
            return diffArray(left, right);

        // Descend into two regular objects.
        var leftIsObject  = typeof(left)  === 'object' && !leftIsArray;
        var rightIsObject = typeof(right) === 'object' && !rightIsArray;
        if (leftIsObject && rightIsObject)
            return diffObject(left, right);
    }

    // Reset everything else.
    return 'reset';
}

// Patch objects generated have:
//  - `t` is always 'o'.
//  - `r` is a set of keys removed.
//  - `s` is a map of keys to new values.
//  - `p` is a map of keys to more specific patches.
function diffObject(left, right) {
    var r = [], s = {}, p = {};
    var key, valLeft, valRight;
    var numAttrs = 0, numSets = 0, numPatches = 0;

    // Walk existing properties.
    for (key in left) {
        valLeft = left[key];
        valRight = right[key];
        if (valLeft === undefined)
            continue;

        numAttrs += 1;

        // Attribute was removed.
        if (valRight === undefined) {
            r.push(key);
            continue;
        }

        // Diff and merge the resulting patch.
        var patch = diffValue(valLeft, valRight);
        if (patch === 'reset') {
            s[key] = valRight;
            numSets += 1;
        }
        else if (patch !== 'none') {
            p[key] = patch;
            numPatches += 1;
        }
    }

    // No partial changes, tell parent we should be reset.
    if (r.length + numSets === numAttrs)
        return 'reset';

    // Find new properties.
    for (key in right) {
        valLeft = left[key];
        valRight = right[key];
        if (valRight === undefined)
            continue;

        if (valLeft === undefined) {
            s[key] = valRight;
            numSets += 1;
        }
    }

    // Build the patch object.
    var res = {t:'o'};
    if (r.length)   res.r = r;
    if (numSets)    res.s = s;
    if (numPatches) res.p = p;
    if (!res.r && !res.s && !res.p)
        return 'none';
    else
        return res;
}

// Patch objects generated have:
//  - `t` is always 'a'.
//  - `p` is a map of indices to more specific patches.
//    These reference original indices, and should be applied first.
//  - `s` is a list of splices, each an array of `splice()` arguments.
//    These are in reverse order, so they can be applied as specified.
function diffArray(left, right) {
    var lenLeft = left.length;
    var lenRight = right.length;

    // Build a table of longest common subsequence lengths.
    var width = lenLeft + 1;
    var height = lenRight + 1;
    var diag = width + 1;
    var size = width * height;
    var lengths = new Array(size);
    var diffs = new Array(size);

    var idx, idxLeft, idxRight, diff;

    // Add sentinels.
    for (idx = 0; idx < width; idx += 1)
        lengths[idx] = 0;
    for (idx = 0; idx < size; idx += width)
        lengths[idx] = 0;

    // Skip across sentinels.
    idx = width;
    for (idxRight = 0; idxRight < lenRight; idxRight += 1) {
        idx += 1;
        for (idxLeft = 0; idxLeft < lenLeft; idxLeft += 1) {
            // Diff and store result.
            diff = diffValue(left[idxLeft], right[idxRight]);
            diffs[idx] = diff;

            // Treat exact matches, but also patches, as equal.
            if (diff !== 'reset') {
                lengths[idx] = lengths[idx - diag] + 1;
            }
            else {
                lengths[idx] = Math.max(
                    lengths[idx - 1],
                    lengths[idx - width]
                );
            }

            idx += 1;
        }
    }

    // Collect patches and splices.
    var numPatches = 0;
    var p = {};
    var s = [];

    idxLeft = lenLeft - 1;
    idxRight = lenRight - 1;
    idx = size - 1;

    var current = [null, null];
    // Push the current left side onto the splice as a removed item.
    function removeItem() {
        var idxAfter = idxLeft + 1;
        if (current[0] === idxAfter) {
            current[0] -= 1; current[1] += 1;
        }
        else {
            s.push(current = [idxLeft, 1]);
        }
        idxLeft -= 1; idx -= 1;
    }
    // Push the current right side onto the splice as an added item.
    function addItem() {
        var idxAfter = idxLeft + 1;
        if (current[0] === idxAfter) {
            current.splice(2, 0, right[idxRight]);
        }
        else {
            s.push(current = [idxAfter, 0, right[idxRight]]);
        }
        idxRight -= 1; idx -= width;
    }

    // Backtrack through the table.
    while (idxLeft >= 0 && idxRight >= 0) {
        diff = diffs[idx];

        if (diff === 'reset') {
            // Left side is not in the LCS, so that item was removed.
            if (lengths[idx - 1] > lengths[idx - width])
                removeItem();
            // Right side is not in the LCS, so that item was added.
            else
                addItem();
        }
        // Both are in the LCS, simply use the diff.
        else {
            if (diff !== 'none') {
                p[idxLeft] = diff;
                numPatches += 1;
            }
            idxLeft -= 1; idxRight -= 1; idx -= diag;
        }
    }
    // Flush both sides.
    while (idxLeft >= 0)
        removeItem();
    while (idxRight >= 0)
        addItem();

    // If we splice the entire array, return reset.
    if (s[0] && s[0][1] === lenLeft)
        return 'reset';

    // Build the patch object.
    var res = {t:'a'};
    if (numPatches) res.p = p;
    if (s.length)   res.s = s;
    if (!res.p && !res.s)
        return 'none';
    else
        return res;
}

})();
