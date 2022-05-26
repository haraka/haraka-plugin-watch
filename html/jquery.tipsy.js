// tipsy, facebook style tooltips for jquery
// version 1.3.1
// (c) 2008-2010 jason frame [jason@onehackoranother.com]
// released under the MIT license
//
// Modified by Atlassian
// https://github.com/atlassian/tipsy

(function($) {
    var liveBindingWarning =
        "To be compatible with jQuery 1.9 and higher," +
        " You must pass a selector to tipsy's live argument." +
        " For instance, `$(document).tipsy({live: 'a.live'});`";

    function maybeCall(thing, ctx) {
        return typeof thing == "function" ? thing.call(ctx) : thing;
    }

    function isElementInDOM(ele) {
        var el = ele && ele.jquery ? ele.get(0) : ele;
        return $.contains(document.documentElement, el);
    }

    var tipsyIDcounter = 0;
    function tipsyID() {
        var tipsyID = tipsyIDcounter++;
        return "tipsyuid" + tipsyID;
    }

    function Tipsy(element, options) {
        this.$element = $(element);
        this.options = options;
        this.enabled = true;
        this.fixTitle();
    }

    Tipsy.prototype = {
        show: function() {
            // if element is not in the DOM then don't show the Tipsy and return early
            if (!isElementInDOM(this.$element)) {
                return;
            }

            var title = this.getTitle();
            if (!title || !this.enabled) {
                return;
            }
            
            var $tip = this.tip();

            $tip.find(".tipsy-inner")[this.options.html ? "html" : "text"](
                title
            );
            $tip[0].className = "tipsy"; // reset classname in case of dynamic gravity
            $tip.remove()
                .css({
                    top: 0,
                    left: 0,
                    visibility: "hidden",
                    display: "block"
                })
                .appendTo(document.body);

            var that = this;
            function tipOver() {
                that.hoverTooltip = true;
            }
            function tipOut() {
                if (that.hoverState == "in") return; // If field is still focused.
                that.hoverTooltip = false;
                if (that.options.trigger != "manual") {
                    var eventOut =
                        that.options.trigger == "hover"
                            ? "mouseleave.tipsy"
                            : "blur.tipsy";
                    that.$element.trigger(eventOut);
                }
            }

            if (this.options.hoverable) {
                $tip.hover(tipOver, tipOut);
            }

            if (this.options.className) {
                $tip.addClass(
                    maybeCall(this.options.className, this.$element[0])
                );
            }

            var pos = $.extend({}, this.$element.offset(), {
                width: this.$element[0].getBoundingClientRect().width,
                height: this.$element[0].getBoundingClientRect().height
            });

            var tipCss = {};
            var actualWidth = $tip[0].offsetWidth,
                actualHeight = $tip[0].offsetHeight;
            var gravity = maybeCall(this.options.gravity, this.$element[0]);

            if (gravity.length === 2) {
                if (gravity.charAt(1) === "w") {
                    tipCss.left = pos.left + pos.width / 2 - 15;
                } else {
                    tipCss.left =
                        pos.left + pos.width / 2 - actualWidth + 15;
                }
            }

            switch (gravity.charAt(0)) {
                case "n":
                    // left could already be set if gravity is 'nw' or 'ne'
                    if (typeof tipCss.left === "undefined") {
                        tipCss.left =
                            pos.left + pos.width / 2 - actualWidth / 2;
                    }
                    tipCss.top = pos.top + pos.height + this.options.offset;
                    break;
                case "s":
                    // left could already be set if gravity is 'sw' or 'se'
                    if (typeof tipCss.left === "undefined") {
                        tipCss.left =
                            pos.left + pos.width / 2 - actualWidth / 2;

                        // We need to apply the left positioning and then recalculate the tooltip height
                        // If the tooltip is positioned close to the right edge of the window, it could cause
                        // the tooltip text to overflow and change height.
                        $tip.css(tipCss);
                        actualHeight = $tip[0].offsetHeight;
                    }
                    tipCss.top =
                        pos.top - actualHeight - this.options.offset;
                    break;
                case "e":
                    tipCss.left =
                        pos.left - actualWidth - this.options.offset;
                    tipCss.top =
                        pos.top + pos.height / 2 - actualHeight / 2;
                    break;
                case "w":
                    tipCss.left =
                        pos.left + pos.width + this.options.offset;
                    tipCss.top =
                        pos.top + pos.height / 2 - actualHeight / 2;
                    break;
            }

            $tip.css(tipCss).addClass("tipsy-" + gravity);
            $tip.find(".tipsy-arrow")[0].className =
                "tipsy-arrow tipsy-arrow-" + gravity.charAt(0);

            if (this.options.fade) {
                $tip.stop()
                    .css({
                        opacity: 0,
                        display: "block",
                        visibility: "visible"
                    })
                    .animate({ opacity: this.options.opacity });
            } else {
                $tip.css({
                    visibility: "visible",
                    opacity: this.options.opacity
                });
            }

            if (this.options.aria) {
                var $tipID = tipsyID();
                $tip.attr("id", $tipID);
                this.$element.attr("aria-describedby", $tipID);
            }
        },

        destroy: function() {
            this.$element.removeData("tipsy");

            this.unbindHandlers();
            this.hide();
        },

        unbindHandlers: function() {
            if (this.options.live) {
                $(document).off(".tipsy", this.options.live);
            } else {
                this.$element.off(".tipsy");
            }
        },

        hide: function() {
            if (this.options.fade) {
                this.tip()
                    .stop()
                    .fadeOut(function() {
                        $(this).remove();
                    });
            } else {
                this.tip().remove();
            }
            if (this.options.aria) {
                this.$element.removeAttr("aria-describedby");
            }
        },

        fixTitle: function() {
            var $e = this.$element;
            if (
                $e.attr("title") ||
                typeof $e.attr("original-title") != "string"
            ) {
                $e.attr("original-title", $e.attr("title") || "").removeAttr(
                    "title"
                );
            }
        },

        getTitle: function() {
            var title,
                $e = this.$element,
                o = this.options;
            this.fixTitle();
            var title,
                o = this.options;
            if (typeof o.title == "string") {
                title = $e.attr(
                    o.title == "title" ? "original-title" : o.title
                );
            } else if (typeof o.title == "function") {
                title = o.title.call($e[0]);
            }
            title = ("" + title).replace(/(^\s*|\s*$)/, "");
            return title || o.fallback;
        },

        tip: function() {
            if (!this.$tip) {
                this.$tip = $('<div class="tipsy"></div>')
                    .html(
                        '<div class="tipsy-arrow"></div><div class="tipsy-inner"></div>'
                    )
                    .attr("role", "tooltip");
                this.$tip.data("tipsy-pointee", this.$element[0]);
            }
            return this.$tip;
        },

        validate: function() {
            if (!this.$element[0].parentNode) {
                this.hide();
                this.$element = null;
                this.options = null;
            }
        },

        enable: function() {
            this.enabled = true;
        },
        disable: function() {
            this.enabled = false;
        },
        toggleEnabled: function() {
            this.enabled = !this.enabled;
        }
    };

    $.fn.tipsy = function(options) {
        if (options === true) {
            return this.data("tipsy");
        } else if (typeof options == "string") {
            var tipsy = this.data("tipsy");
            if (tipsy) tipsy[options]();
            return this;
        }

        options = $.extend({}, $.fn.tipsy.defaults, options);
        if (options.hoverable) {
            options.delayOut = options.delayOut || 20;
        }

        // Check for jQuery support and patch live binding for jQuery 3 compat.
        if (options.live === true) {
            if (!this.selector) {
                // No more jQuery support!
                throw new Error(liveBindingWarning);
            } else {
                // Deprecated behaviour
                console && console.warn && console.warn(liveBindingWarning);
                options.live = this.selector;
            }
        }

        function get(ele) {
            var tipsy = $.data(ele, "tipsy");
            if (!tipsy) {
                tipsy = new Tipsy(ele, $.fn.tipsy.elementOptions(ele, options));
                $.data(ele, "tipsy", tipsy);
            }
            return tipsy;
        }

        function enter() {
            var tipsy = get(this);
            tipsy.hoverState = "in";
            if (options.delayIn == 0) {
                tipsy.show();
            } else {
                tipsy.fixTitle();
                setTimeout(function() {
                    if (
                        tipsy.hoverState == "in" &&
                        isElementInDOM(tipsy.$element)
                    ) {
                        tipsy.show();
                    }
                }, options.delayIn);
            }
        }

        function leave() {
            var tipsy = get(this);
            tipsy.hoverState = "out";
            if (options.delayOut == 0) {
                tipsy.hide();
            } else {
                setTimeout(function() {
                    if (tipsy.hoverState == "out" && !tipsy.hoverTooltip) {
                        tipsy.hide();
                    }
                }, options.delayOut);
            }
        }

        // create a tipsy object for every selected element,
        // even when the events are delegated.
        // this allows destruction to occur.
        this.each(function() {
            get(this);
        });

        if (options.trigger != "manual") {
            var eventIn =
                    options.trigger == "hover"
                        ? "mouseenter.tipsy focus.tipsy"
                        : "focus.tipsy",
                eventOut =
                    options.trigger == "hover"
                        ? "mouseleave.tipsy blur.tipsy"
                        : "blur.tipsy";
            if (options.live) {
                $(document)
                    .on(eventIn, options.live, enter)
                    .on(eventOut, options.live, leave);
            } else {
                this.on(eventIn, enter).on(eventOut, leave);
            }
        }

        return this;
    };

    $.fn.tipsy.defaults = {
        aria: false,
        className: null,
        delayIn: 0,
        delayOut: 0,
        fade: false,
        fallback: "",
        gravity: "n",
        html: false,
        live: false,
        hoverable: false,
        offset: 0,
        opacity: 0.8,
        title: "title",
        trigger: "hover"
    };

    $.fn.tipsy.revalidate = function() {
        $(".tipsy").each(function() {
            var pointee = $.data(this, "tipsy-pointee");
            if (!pointee || !isElementInDOM(pointee)) {
                $(this).remove();
            }
        });
    };

    // Overwrite this method to provide options on a per-element basis.
    // For example, you could store the gravity in a 'tipsy-gravity' attribute:
    // return $.extend({}, options, {gravity: $(ele).attr('tipsy-gravity') || 'n' });
    // (remember - do not modify 'options' in place!)
    $.fn.tipsy.elementOptions = function(ele, options) {
        return $.metadata ? $.extend({}, options, $(ele).metadata()) : options;
    };

    $.fn.tipsy.autoNS = function() {
        return $(this).offset().top >
            $(document).scrollTop() + $(window).height() / 2
            ? "s"
            : "n";
    };

    $.fn.tipsy.autoWE = function() {
        return $(this).offset().left >
            $(document).scrollLeft() + $(window).width() / 2
            ? "e"
            : "w";
    };

    /**
     * yields a closure of the supplied parameters, producing a function that takes
     * no arguments and is suitable for use as an autogravity function like so:
     *
     * @param margin (int) - distance from the viewable region edge that an
     *        element should be before setting its tooltip's gravity to be away
     *        from that edge.
     * @param prefer (string, e.g. 'n', 'sw', 'w') - the direction to prefer
     *        if there are no viewable region edges effecting the tooltip's
     *        gravity. It will try to vary from this minimally, for example,
     *        if 'sw' is preferred and an element is near the right viewable
     *        region edge, but not the top edge, it will set the gravity for
     *        that element's tooltip to be 'se', preserving the southern
     *        component.
     */
    $.fn.tipsy.autoBounds = function(margin, prefer) {
        return function() {
            var dir = {
                    ns: prefer[0],
                    ew: prefer.length > 1 ? prefer[1] : false
                },
                boundTop = $(document).scrollTop() + margin,
                boundLeft = $(document).scrollLeft() + margin,
                $this = $(this);

            if ($this.offset().top < boundTop) dir.ns = "n";
            if ($this.offset().left < boundLeft) dir.ew = "w";
            if (
                $(window).width() +
                    $(document).scrollLeft() -
                    $this.offset().left <
                margin
            )
                dir.ew = "e";
            if (
                $(window).height() +
                    $(document).scrollTop() -
                    $this.offset().top <
                margin
            )
                dir.ns = "s";

            return dir.ns + (dir.ew ? dir.ew : "");
        };
    };
})(jQuery);
